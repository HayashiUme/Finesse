using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

public sealed class FinesseHttpService : BackgroundService
{
    private readonly FinesseOptions _options;
    private readonly AuthenticationService _authentication;
    private readonly SnapshotService _snapshots;
    private readonly ReportService _reports;
    private readonly ManagementService _management;
    private readonly PluginManagementService? _plugins;
    private readonly ILogger<FinesseHttpService> _logger;
    private readonly HttpListener _listener = new();

    public FinesseHttpService(
        FinesseOptions options,
        AuthenticationService authentication,
        SnapshotService snapshots,
        ManagementService management,
        ILogger<FinesseHttpService> logger,
        ReportService reports,
        PluginManagementService? plugins = null)
    {
        _options = options;
        _authentication = authentication;
        _snapshots = snapshots;
        _reports = reports;
        _management = management;
        _plugins = plugins;
        _logger = logger;
        _listener.Prefixes.Add(options.Url);
    }

    public override Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        try { _listener.Start(); }
        catch (HttpListenerException ex)
        {
            throw new InvalidOperationException($"Finesse cannot listen on {_options.Url}. Check whether the port is occupied or the account needs an HTTP URL reservation. Configuration: {Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "finesse.json")}", ex);
        }
        _logger.LogInformation("Finesse API listening on {Url}. Configuration: {ConfigPath}", _options.Url, Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "finesse.json"));

        return base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var context = await _listener.GetContextAsync().WaitAsync(stoppingToken);
                _ = HandleSafelyAsync(context, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (HttpListenerException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        try { await base.StopAsync(cancellationToken); }
        finally { if (_listener.IsListening) _listener.Stop(); }
    }

    public override void Dispose()
    {
        _listener.Close();
        base.Dispose();
    }

    private async Task HandleSafelyAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        try
        {
            context.Response.Headers["Cache-Control"] = "no-store";
            context.Response.Headers["Pragma"] = "no-cache";
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            AddCors(context);
            var origin = context.Request.Headers["Origin"];
            if (origin is not null && !_options.AllowsOrigin(origin))
            {
                await WriteErrorAsync(context.Response, HttpStatusCode.Forbidden, "Dashboard origin is not in allowedOrigins");
                return;
            }
            if (context.Request.HttpMethod == "OPTIONS")
            {
                context.Response.StatusCode = (int)HttpStatusCode.NoContent;
                context.Response.Close();
                return;
            }

            var path = context.Request.Url?.AbsolutePath.TrimEnd('/') ?? string.Empty;
            var isLoginRequest = context.Request.HttpMethod == "POST" &&
                path is "/api/v1/auth/login/admin" or "/api/v1/auth/login/superadmin";

            if (context.Request.IsWebSocketRequest && path == "/api/v1/events")
            {
                var token = context.Request.Headers["Sec-WebSocket-Protocol"]?.Split(',')
                    .Select(value => value.Trim()).FirstOrDefault(value => value.StartsWith("bearer.", StringComparison.Ordinal))?[7..]
                    ?? context.Request.QueryString["token"];
                var apiKey = context.Request.QueryString["key"];
                if (!TryAuthenticate(token, apiKey, out _))
                {
                    await WriteErrorAsync(context.Response, HttpStatusCode.Unauthorized, "Unauthorized");
                    return;
                }

                await ServeWebSocketAsync(context, token, apiKey, cancellationToken);
                return;
            }

            var authorization = context.Request.Headers["Authorization"];
            var bearer = authorization?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true
                ? authorization[7..].Trim()
                : null;
            AuthUser? user = null;
            var credential = context.Request.Headers["X-Api-Key"];
            if (!isLoginRequest && !TryAuthenticate(bearer, credential, out user))
            {
                await WriteErrorAsync(context.Response, HttpStatusCode.Unauthorized, "Unauthorized");
                return;
            }

            await RouteAsync(context, cancellationToken, user, bearer);
        }
        catch (ManagementException exception)
        {
            await WriteErrorAsync(context.Response, (HttpStatusCode)exception.Status, exception.Message);
        }
        catch (JsonException)
        {
            await WriteErrorAsync(context.Response, HttpStatusCode.BadRequest, "invalidJson");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { context.Response.Abort(); }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Finesse request failed.");
            try
            {
                await WriteErrorAsync(context.Response, HttpStatusCode.InternalServerError, "Internal server error");
            }
            catch (Exception ex) when (ex is IOException or HttpListenerException or ObjectDisposedException) { }
        }
    }

    private async Task RouteAsync(HttpListenerContext context, CancellationToken cancellationToken, AuthUser? user, string? token)
    {
        var request = context.Request;
        var path = request.Url?.AbsolutePath.TrimEnd('/') ?? string.Empty;
        if (request.HttpMethod == "POST" && path is "/api/v1/auth/login/admin" or "/api/v1/auth/login/superadmin")
        {
            var body = await ReadJsonAsync<LoginRequest>(request, 16_384, cancellationToken);
            var ip = ResolveClientAddress(request)?.ToString() ?? "unknown";
            var result = path.EndsWith("superadmin", StringComparison.Ordinal)
                ? _authentication.LoginSuperAdmin(body.ApiKey, ip, body.CaptchaId, body.CaptchaAnswer)
                : _authentication.LoginAdmin(body.Username, body.Password, ip, body.CaptchaId, body.CaptchaAnswer);
            context.Response.StatusCode = result.Status;
            if (result.Session is { } session)
            {
                var address = ResolveClientAddress(request);
                var location = IsLocalAddress(address) ? "local" : null;
                _management.RecordPanelLogin(ip, location, session.User.Username, true, $"Panel login ({session.User.Role})");
                await WriteJsonAsync(context.Response, new { session, login = new PanelLoginDto(ip, location, DateTimeOffset.UtcNow) });
            }
            else
            {
                _management.RecordPanelLogin(ip, null, path.EndsWith("superadmin", StringComparison.Ordinal) ? "superadmin" : body.Username ?? "unknown", false, result.Error ?? "Login failed");
                await WriteJsonAsync(context.Response, new { error = result.Error, challenge = result.Challenge, retryAfterSeconds = result.RetryAfterSeconds });
            }
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/auth/me")
        {
            await WriteJsonAsync(context.Response, new { user });
        }
        else if (request.HttpMethod == "POST" && path == "/api/v1/auth/logout")
        {
            _authentication.Logout(token);
            context.Response.StatusCode = (int)HttpStatusCode.NoContent;
            context.Response.Close();
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/auth/users")
        {
            RequireSuperAdmin(user);
            await WriteJsonAsync(context.Response, _authentication.GetUsers());
        }
        else if (request.HttpMethod == "POST" && path == "/api/v1/auth/users")
        {
            RequireSuperAdmin(user);
            var body = await ReadJsonAsync<CreateUserRequest>(request, 400_000, cancellationToken);
            await WriteJsonAsync(context.Response, _authentication.CreateUser(body.Username, body.Password, body.Avatar));
        }
        else if (request.HttpMethod == "DELETE" && path.StartsWith("/api/v1/auth/users/", StringComparison.Ordinal))
        {
            RequireSuperAdmin(user);
            var id = Uri.UnescapeDataString(path["/api/v1/auth/users/".Length..]);
            _authentication.DeleteUser(id);
            context.Response.StatusCode = (int)HttpStatusCode.NoContent;
            context.Response.Close();
        }
        else if (request.HttpMethod == "PUT" && path == "/api/v1/auth/me/avatar")
        {
            var body = await ReadJsonAsync<AvatarRequest>(request, 400_000, cancellationToken);
            await WriteJsonAsync(context.Response, new { user = _authentication.UpdateAvatar(user!, body.Avatar) });
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/health")
        {
            await WriteJsonAsync(context.Response, new { status = "ok", pluginVersion = "0.1.0" });
        }
        else if (request.HttpMethod == "POST" && path == "/api/v1/login")
        {
            var address = ResolveClientAddress(request);
            var ip = address?.ToString() ?? "unknown";
            var location = IsLocalAddress(address) ? "local" : null;
            _management.RecordPanelLogin(ip, location, user?.Username ?? "superadmin", true, "Panel connection");
            await WriteJsonAsync(context.Response, new PanelLoginDto(ip, location, DateTimeOffset.UtcNow));
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/overview")
        {
            var snapshot = _snapshots.GetSnapshot();
            await WriteJsonAsync(context.Response, new OverviewDto(snapshot.Status, snapshot.UptimeSeconds, snapshot.OnlinePlayers, snapshot.ActiveGames, snapshot.TotalGames, snapshot.PluginVersion, snapshot.Process));
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/games")
        {
            await WriteJsonAsync(context.Response, _snapshots.GetSnapshot().Games);
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/players")
        {
            await WriteJsonAsync(context.Response, _snapshots.GetSnapshot().Players);
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/reports")
        {
            await WriteJsonAsync(context.Response, _reports.GetRecent());
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/server")
        {
            await WriteJsonAsync(context.Response, _snapshots.GetServerInfo());
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/plugins")
        {
            await WriteJsonAsync(context.Response, _plugins?.GetPlugins() ?? []);
        }
        else if (request.HttpMethod == "POST" && TryParsePluginAction(path, out var pluginId, out var pluginAction))
        {
            RequireSuperAdmin(user);
            if (_plugins is null) throw new ManagementException(503, "pluginManagerUnavailable");
            PluginInfoDto updated;
            try { updated = await _plugins.SetEnabledAsync(pluginId, pluginAction == "enable"); }
            catch (Exception ex)
            {
                _management.RecordExternalAction(pluginAction == "enable" ? "pluginEnable" : "pluginDisable", pluginId, false,
                    ex is ManagementException ? ex.Message : "Operation failed");
                throw;
            }
            _management.RecordExternalAction(pluginAction == "enable" ? "pluginEnable" : "pluginDisable", pluginId, true, "Completed");
            await WriteJsonAsync(context.Response, updated);
        }
        else if (request.HttpMethod == "DELETE" && path.StartsWith("/api/v1/plugins/", StringComparison.Ordinal))
        {
            RequireSuperAdmin(user);
            if (_plugins is null) throw new ManagementException(503, "pluginManagerUnavailable");
            var deletePluginId = Uri.UnescapeDataString(path["/api/v1/plugins/".Length..]);
            PluginInfoDto removed;
            try { removed = await _plugins.DeleteAsync(deletePluginId); }
            catch (Exception ex)
            {
                _management.RecordExternalAction("pluginDelete", deletePluginId, false,
                    ex is ManagementException ? ex.Message : "Operation failed");
                throw;
            }
            _management.RecordExternalAction("pluginDelete", deletePluginId, true, "Plugin DLL removed; restart required");
            await WriteJsonAsync(context.Response, removed);
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/bans")
        {
            await WriteJsonAsync(context.Response, _management.GetBans());
        }
        else if (request.HttpMethod == "POST" && path == "/api/v1/bans")
        {
            var body = await ReadJsonAsync<BanRequest>(request, 4096, cancellationToken);
            // Normalize before queueing so malformed targets never reach the audit log.
            var target = BanService.Normalize(body.Kind, body.Value);
            await WriteJsonAsync(context.Response, await _management.ExecuteAsync("serverBan", body.Kind + ":" + target, null, null, body, cancellationToken));
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/audit")
        {
            await WriteJsonAsync(context.Response, _management.GetAudit());
        }
        else if (request.HttpMethod == "DELETE" && path.StartsWith("/api/v1/bans/", StringComparison.Ordinal))
        {
            var id = path["/api/v1/bans/".Length..];
            if (!Guid.TryParseExact(id, "N", out _)) throw new ManagementException(400, "banInvalid");
            await WriteJsonAsync(context.Response, await _management.ExecuteAsync("unban", id, null, null, null, cancellationToken));
        }
        else if (request.HttpMethod == "POST" && path == "/api/v1/broadcast")
        {
            var body = await ReadJsonAsync<MessageRequest>(request, 4096, cancellationToken);
            await WriteJsonAsync(context.Response, await _management.ExecuteAsync("broadcast", "all", null, body.Message, null, cancellationToken));
        }
        else if (request.HttpMethod == "POST" && TryParsePlayerAction(path, out var clientId, out var action))
        {
            string? reason = null;
            if (action == "kick" && request.HasEntityBody)
                reason = (await ReadJsonAsync<KickRequest>(request, 4096, cancellationToken)).Reason;
            await _management.ExecuteCommandAsync(action, clientId.ToString(), null, cancellationToken, reason);
            context.Response.StatusCode = (int)HttpStatusCode.NoContent;
            context.Response.Close();
        }
        else if (request.HttpMethod == "POST" && TryParseGameAction(path, out var code, out var gameAction))
        {
            if (gameAction == "message")
            {
                var body = await ReadJsonAsync<MessageRequest>(request, 4096, cancellationToken);
                await WriteJsonAsync(context.Response, await _management.ExecuteAsync("message", code, null, body.Message, null, cancellationToken));
                return;
            }
            bool? isPublic = null;
            if (gameAction == "privacy")
            {
                if (request.ContentLength64 is 0 or > 1024)
                    throw new ManagementException(400, "Expected a small JSON body with isPublic");
                try
                {
                    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    deadline.CancelAfter(TimeSpan.FromSeconds(10));
                    var bytes = new byte[1025];
                    var length = 0;
                    while (length < bytes.Length)
                    {
                        var read = await request.InputStream.ReadAsync(bytes.AsMemory(length), deadline.Token);
                        if (read == 0) break;
                        length += read;
                    }
                    if (length > 1024) throw new ManagementException(413, "Request body is too large");
                    using var body = JsonDocument.Parse(bytes.AsMemory(0, length));
                    if (body.RootElement.ValueKind != JsonValueKind.Object || !body.RootElement.TryGetProperty("isPublic", out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                        throw new ManagementException(400, "isPublic must be a boolean");
                    isPublic = value.GetBoolean();
                }
                catch (JsonException) { throw new ManagementException(400, "Invalid JSON"); }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new ManagementException(408, "Request body timed out"); }
            }
            await _management.ExecuteCommandAsync(gameAction, code, isPublic, cancellationToken);
            context.Response.StatusCode = (int)HttpStatusCode.NoContent;
            context.Response.Close();
        }
        else
        {
            await WriteErrorAsync(context.Response, HttpStatusCode.NotFound, "Route not found");
        }
    }

    private async Task ServeWebSocketAsync(HttpListenerContext context, string? token, string? apiKey, CancellationToken cancellationToken)
    {
        var protocol = context.Request.Headers["Sec-WebSocket-Protocol"]?.Split(',').Any(value => value.Trim() == "finesse") == true ? "finesse" : null;
        var socket = (await context.AcceptWebSocketAsync(protocol)).WebSocket;
        var buffer = new byte[256];
        try
        {
            var receive = socket.ReceiveAsync(buffer.AsMemory(), cancellationToken).AsTask();
            while (socket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
                if (!TryAuthenticate(token, apiKey, out _))
                {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.PolicyViolation, "Session expired", cancellationToken);
                    return;
                }
                var payload = JsonSerializer.SerializeToUtf8Bytes(new { type = "snapshot", data = _snapshots.GetSnapshot() }, JsonDefaults.Options);
                await socket.SendAsync(payload, WebSocketMessageType.Text, true, cancellationToken);
                var tick = Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                while (!tick.IsCompleted)
                {
                    var completed = await Task.WhenAny(receive, tick);
                    if (completed == tick) break;
                    var result = await receive;
                    if (result.MessageType == WebSocketMessageType.Close) return;
                    receive = socket.ReceiveAsync(buffer.AsMemory(), cancellationToken).AsTask();
                }
                await tick;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (WebSocketException)
        {
        }
        finally
        {
            // Do not wait indefinitely for a disconnected browser's close handshake.
            socket.Abort();
            socket.Dispose();
        }
    }

    private bool TryAuthenticate(string? bearer, string? apiKey, out AuthUser? user)
    {
        if (!string.IsNullOrEmpty(bearer))
        {
            user = _authentication.Authenticate(bearer);
            return user is not null;
        }

        if (!IsApiKey(apiKey))
        {
            user = null;
            return false;
        }
        user = new AuthUser("superadmin", "superadmin", "superadmin", null);
        return true;
    }

    private bool IsApiKey(string? candidate)
    {
        if (string.IsNullOrEmpty(candidate)) return false;
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(_options.ApiKey));
        var candidateHash = SHA256.HashData(Encoding.UTF8.GetBytes(candidate));
        return CryptographicOperations.FixedTimeEquals(expectedHash, candidateHash);
    }

    private static void RequireSuperAdmin(AuthUser? user)
    {
        if (user?.Role != "superadmin") throw new ManagementException(403, "superAdminRequired");
    }

    private static async Task<T> ReadJsonAsync<T>(HttpListenerRequest request, int maxBytes, CancellationToken cancellationToken)
    {
        if (request.ContentLength64 > maxBytes) throw new ManagementException(413, "requestTooLarge");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(10));
        using var stream = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var read = await request.InputStream.ReadAsync(buffer.AsMemory(), deadline.Token);
            if (read == 0) break;
            if (stream.Length + read > maxBytes) throw new ManagementException(413, "requestTooLarge");
            await stream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        return JsonSerializer.Deserialize<T>(stream.ToArray(), JsonDefaults.Options)
            ?? throw new JsonException("Request body is empty.");
    }

    private static bool IsLocalAddress(IPAddress? address)
    {
        if (address is null) return false;
        if (IPAddress.IsLoopback(address) || address.IsIPv6LinkLocal || address.IsIPv6SiteLocal) return true;
        var bytes = address.GetAddressBytes();
        if (bytes.Length == 4)
        {
            return bytes[0] == 10 ||
                (bytes[0] == 172 && (bytes[1] & 0xf0) == 16) ||
                (bytes[0] == 192 && bytes[1] == 168) ||
                (bytes[0] == 169 && bytes[1] == 254) ||
                (bytes[0] == 100 && (bytes[1] & 0xc0) == 64);
        }
        return bytes.Length == 16 && (bytes[0] & 0xfe) == 0xfc;
    }

    private static IPAddress? ResolveClientAddress(HttpListenerRequest request)
    {
        var remote = NormalizeIp(request.RemoteEndPoint?.Address);
        // Forwarding headers are accepted only from a reverse proxy on this host.
        if (remote is null || !IPAddress.IsLoopback(remote)) return remote;
        var realIp = request.Headers["X-Real-IP"];
        if (TryNormalizeIp(realIp, out var address)) return address;

        var forwardedFor = request.Headers["X-Forwarded-For"];
        if (!string.IsNullOrWhiteSpace(forwardedFor) && TryNormalizeIp(forwardedFor.Split(',')[0].Trim(), out address))
            return address;

        return remote;
    }

    private static bool TryNormalizeIp(string? value, out IPAddress? address)
    {
        address = null;
        if (!IPAddress.TryParse(value, out var parsed)) return false;
        address = NormalizeIp(parsed);
        return true;
    }

    private static IPAddress? NormalizeIp(IPAddress? address) =>
        address?.IsIPv4MappedToIPv6 == true ? address.MapToIPv4() : address;

    private static bool TryParsePlayerAction(string path, out int clientId, out string action)
    {
        clientId = 0;
        action = string.Empty;
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return segments.Length == 5 && segments[0] == "api" && segments[1] == "v1" && segments[2] == "players" &&
            int.TryParse(segments[3], out clientId) && segments[4] is "kick" or "ban" && (action = segments[4]) is not null;
    }

    private static bool TryParsePluginAction(string path, out string pluginId, out string action)
    {
        pluginId = action = string.Empty;
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length != 5 || segments[0] != "api" || segments[1] != "v1" || segments[2] != "plugins" || segments[4] is not ("enable" or "disable")) return false;
        pluginId = Uri.UnescapeDataString(segments[3]);
        action = segments[4];
        return true;
    }

    private static bool TryParseGameAction(string path, out string code, out string action)
    {
        code = action = string.Empty;
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length != 5 || segments[0] != "api" || segments[1] != "v1" || segments[2] != "games" || segments[4] is not ("privacy" or "close" or "message")) return false;
        code = segments[3];
        action = segments[4];
        return true;
    }

    private void AddCors(HttpListenerContext context)
    {
        var origin = context.Request.Headers["Origin"];
        if (_options.AllowsOrigin(origin))
        {
            context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Response.Headers["Vary"] = "Origin";
            context.Response.Headers["Access-Control-Allow-Headers"] = "X-Api-Key, Authorization, Content-Type";
            context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
        }
    }

    private static async Task WriteJsonAsync(HttpListenerResponse response, object value)
    {
        response.ContentType = "application/json; charset=utf-8";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, JsonDefaults.Options);
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
        response.Close();
    }

    private static Task WriteErrorAsync(HttpListenerResponse response, HttpStatusCode status, string message)
    {
        response.StatusCode = (int)status;
        return WriteJsonAsync(response, new { error = message });
    }

    private sealed record LoginRequest(string? ApiKey, string? Username, string? Password, string? CaptchaId, string? CaptchaAnswer);
    private sealed record CreateUserRequest(string? Username, string? Password, string? Avatar);
    private sealed record AvatarRequest(string? Avatar);
}
