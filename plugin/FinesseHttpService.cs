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
    private readonly SnapshotService _snapshots;
    private readonly ManagementService _management;
    private readonly ILogger<FinesseHttpService> _logger;
    private readonly HttpListener _listener = new();

    public FinesseHttpService(
        FinesseOptions options,
        SnapshotService snapshots,
        ManagementService management,
        ILogger<FinesseHttpService> logger)
    {
        _options = options;
        _snapshots = snapshots;
        _management = management;
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

            if (context.Request.IsWebSocketRequest && context.Request.Url?.AbsolutePath == "/api/v1/events")
            {
                var queryKey = context.Request.QueryString["key"];
                if (!IsAuthorized(queryKey))
                {
                    await WriteErrorAsync(context.Response, HttpStatusCode.Unauthorized, "Unauthorized");
                    return;
                }

                await ServeWebSocketAsync(context, cancellationToken);
                return;
            }

            if (!IsAuthorized(context.Request.Headers["X-Api-Key"]))
            {
                await WriteErrorAsync(context.Response, HttpStatusCode.Unauthorized, "Unauthorized");
                return;
            }

            await RouteAsync(context, cancellationToken);
        }
        catch (ManagementException exception)
        {
            await WriteErrorAsync(context.Response, (HttpStatusCode)exception.Status, exception.Message);
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

    private async Task RouteAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var request = context.Request;
        var path = request.Url?.AbsolutePath.TrimEnd('/') ?? string.Empty;
        if (request.HttpMethod == "GET" && path == "/api/v1/health")
        {
            await WriteJsonAsync(context.Response, new { status = "ok", pluginVersion = "0.1.0" });
        }
        else if (request.HttpMethod == "POST" && path == "/api/v1/login")
        {
            var address = ResolveClientAddress(request);
            var ip = address?.ToString() ?? "unknown";
            var location = IsLocalAddress(address) ? "local" : null;
            _management.RecordPanelLogin(ip, location);
            await WriteJsonAsync(context.Response, new PanelLoginDto(ip, location, DateTimeOffset.UtcNow));
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/overview")
        {
            var snapshot = _snapshots.GetSnapshot();
            await WriteJsonAsync(context.Response, new OverviewDto(snapshot.Status, snapshot.UptimeSeconds, snapshot.OnlinePlayers, snapshot.ActiveGames, snapshot.TotalGames, snapshot.PluginVersion));
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/games")
        {
            await WriteJsonAsync(context.Response, _snapshots.GetSnapshot().Games);
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/players")
        {
            await WriteJsonAsync(context.Response, _snapshots.GetSnapshot().Players);
        }
        else if (request.HttpMethod == "GET" && path == "/api/v1/audit")
        {
            await WriteJsonAsync(context.Response, _management.GetAudit());
        }
        else if (request.HttpMethod == "POST" && TryParsePlayerAction(path, out var clientId, out var action))
        {
            await _management.ExecuteCommandAsync(action, clientId.ToString(), null, cancellationToken);
            context.Response.StatusCode = (int)HttpStatusCode.NoContent;
            context.Response.Close();
        }
        else if (request.HttpMethod == "POST" && TryParseGameAction(path, out var code, out var gameAction))
        {
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

    private async Task ServeWebSocketAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var socket = (await context.AcceptWebSocketAsync(null)).WebSocket;
        var buffer = new byte[256];
        try
        {
            var receive = socket.ReceiveAsync(buffer.AsMemory(), cancellationToken).AsTask();
            while (socket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
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

    private bool IsAuthorized(string? candidate)
    {
        if (string.IsNullOrEmpty(candidate)) return false;
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(_options.ApiKey));
        var candidateHash = SHA256.HashData(Encoding.UTF8.GetBytes(candidate));
        return CryptographicOperations.FixedTimeEquals(expectedHash, candidateHash);
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
        var realIp = request.Headers["X-Real-IP"];
        if (TryNormalizeIp(realIp, out var address)) return address;

        var forwardedFor = request.Headers["X-Forwarded-For"];
        if (!string.IsNullOrWhiteSpace(forwardedFor) && TryNormalizeIp(forwardedFor.Split(',')[0].Trim(), out address))
            return address;

        return NormalizeIp(request.RemoteEndPoint?.Address);
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

    private static bool TryParseGameAction(string path, out string code, out string action)
    {
        code = action = string.Empty;
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length != 5 || segments[0] != "api" || segments[1] != "v1" || segments[2] != "games" || segments[4] is not ("privacy" or "close")) return false;
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
            context.Response.Headers["Access-Control-Allow-Headers"] = "X-Api-Key, Content-Type";
            context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
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
}
