using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using Empostor.Api.Games.Managers;
using Empostor.Api.Innersloth;
using Empostor.Api.Net.Manager;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

public sealed record AuditEntry(DateTimeOffset Timestamp, string Action, string Target, bool Success, string Detail, string? Location = null);
public sealed class ManagementException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

public sealed record MessageRequest(string? Message);
public sealed record KickRequest(string? Reason);
public sealed record CommandResult(int Delivered, int Skipped, int Failed);

public sealed class ManagementService : BackgroundService
{
    private sealed record Command(string Action, string Target, bool? IsPublic, string? Message, BanRequest? Ban, string? Reason, TaskCompletionSource<CommandResult> Completion, CancellationToken RequestToken);
    private readonly Channel<Command> _commands = Channel.CreateBounded<Command>(new BoundedChannelOptions(64) { SingleReader = true });
    private readonly ConcurrentQueue<AuditEntry> _audit = new();
    private readonly object _auditGate = new();
    private readonly IDataStore<AuditEntry[]> _auditStore;
    private readonly ILogger<ManagementService> _logger;
    private readonly IGameManager _games;
    private readonly IClientManager _clients;
    private readonly BanService _bans;
    private bool _auditPersistenceAvailable = true;

    public ManagementService(IGameManager games, IClientManager clients, ILogger<ManagementService> logger, BanService bans, string? auditPath = null)
    {
        _games = games;
        _clients = clients;
        _logger = logger;
        _bans = bans;
        var path = auditPath ?? FinesseDataPaths.GetFile("audit.json", "finesse-audit.json");
        _auditStore = new JsonFileDataStore<AuditEntry[]>(path);
        try
        {
            foreach (var entry in _auditStore.Load([]).Take(5000).Reverse()) _audit.Enqueue(entry);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            _auditPersistenceAvailable = false;
            logger.LogError(ex, "Finesse audit history could not be loaded. Repair {Path} before history can be saved.", path);
        }
    }

    public AuditEntry[] GetAudit() => _audit.Reverse().ToArray();

    public void RecordPanelLogin(string ip, string? location, string username, bool success, string detail)
    {
        AddAudit(new(DateTimeOffset.UtcNow, "login", $"{username} · {ip}", success, detail, location));
        _logger.LogInformation("Finesse panel login for {Username} from {Ip} ({Location}), success={Success}", username, ip, location ?? "location unavailable", success);
    }

    public async Task ExecuteCommandAsync(string action, string target, bool? isPublic, CancellationToken cancellationToken, string? reason = null)
    {
        await ExecuteAsync(action, target, isPublic, null, null, cancellationToken, reason);
    }

    public void RecordExternalAction(string action, string target, bool success, string detail)
    {
        AddAudit(new(DateTimeOffset.UtcNow, action, target, success, detail));
        _logger.LogInformation("Finesse audit: {Action} {Target}, success={Success}", action, target, success);
    }

    public BanFeed GetBans() => _bans.GetAll();

    public async Task<CommandResult> ExecuteAsync(string action, string target, bool? isPublic, string? message, BanRequest? ban, CancellationToken cancellationToken, string? reason = null)
    {
        if (action is "message" or "broadcast" && (string.IsNullOrWhiteSpace(message) || message.Length > 250 || message.Any(char.IsControl)))
            throw new ManagementException(400, "messageInvalid");
        if (action == "kick" && (reason?.Length > 200 || reason?.Any(char.IsControl) == true))
            throw new ManagementException(400, "kickReasonInvalid");
        var completion = new TaskCompletionSource<CommandResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_commands.Writer.TryWrite(new Command(action, target, isPublic, message?.Trim(), ban, reason?.Trim(), completion, cancellationToken)))
            throw new ManagementException(503, "Command queue is full or shutting down; try again later.");
        return await completion.Task;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var command in _commands.Reader.ReadAllAsync(stoppingToken))
            {
                if (command.RequestToken.IsCancellationRequested) { command.Completion.TrySetCanceled(command.RequestToken); continue; }
                try
                {
                    var result = await PerformAsync(command);
                    var detail = $"Completed: delivered={result.Delivered}, skipped={result.Skipped}, failed={result.Failed}";
                    if (!string.IsNullOrWhiteSpace(command.Reason)) detail += $"; reason={command.Reason.Trim()}";
                    Record(command, result.Failed == 0, detail);
                    command.Completion.TrySetResult(result);
                }
                catch (Exception ex)
                {
                    var detail = ex is ManagementException ? ex.Message : "Operation failed";
                    if (!string.IsNullOrWhiteSpace(command.Reason)) detail += $"; reason={command.Reason.Trim()}";
                    Record(command, false, detail);
                    _logger.LogWarning(ex, "Finesse command {Action} for {Target} failed", command.Action, command.Target);
                    command.Completion.TrySetException(ex);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            _commands.Writer.TryComplete();
            while (_commands.Reader.TryRead(out var pending)) pending.Completion.TrySetException(new ManagementException(503, "Server is shutting down."));
        }
    }

    private async Task<CommandResult> PerformAsync(Command command)
    {
        if (command.Action == "unban") { _bans.Remove(command.Target); return new(1, 0, 0); }
        if (command.Action == "serverBan")
        {
            _bans.Add(command.Ban ?? throw new ManagementException(400, "banInvalid"));
            var disconnected = 0; var failed = 0;
            foreach (var client in _clients.Clients.ToArray())
            {
                if (_bans.Match(client) is null) continue;
                try { await client.DisconnectAsync(DisconnectReason.Custom, "Banned by server administrator"); disconnected++; }
                catch (Exception ex) { failed++; _logger.LogWarning(ex, "Could not disconnect banned client {Id}", client.Id); }
            }
            return new(disconnected, 0, failed);
        }
        if (command.Action is "broadcast" or "message")
        {
            var targets = _games.Games.Where(g => command.Action == "broadcast" || g.Code.Code.Equals(command.Target, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (command.Action == "message" && targets.Length == 0) throw new ManagementException(404, "Room not found");
            var delivered = 0; var skipped = 0; var failed = 0;
            foreach (var room in targets)
            {
                if (room.Host?.Character is not { } character) { skipped++; continue; }
                try { await character.SendChatAsync("[Server] " + command.Message); delivered++; }
                catch (Exception ex) { failed++; _logger.LogWarning(ex, "Message to room {Code} failed", room.Code.Code); }
            }
            return new(delivered, skipped, failed);
        }
        if (command.Action is "kick" or "ban")
        {
            var client = _clients.Clients.FirstOrDefault(c => c.Id.ToString() == command.Target)
                ?? throw new ManagementException(404, "Player not found");
            if (command.Action == "ban")
            {
                var player = client.Player ?? throw new ManagementException(409, "Player must be in a room for a room ban");
                await player.BanAsync();
            }
            else await client.DisconnectAsync(DisconnectReason.Custom, string.IsNullOrWhiteSpace(command.Reason) ? "Disconnected by administrator" : command.Reason.Trim());
            return new(1, 0, 0);
        }

        var game = _games.Games.FirstOrDefault(g => g.Code.Code.Equals(command.Target, StringComparison.OrdinalIgnoreCase))
            ?? throw new ManagementException(404, "Room not found");
        if (command.Action == "privacy" && command.IsPublic is { } isPublic) await game.SetPrivacyAsync(isPublic);
        else if (command.Action == "close")
        {
            foreach (var player in game.Players.ToArray()) await player.KickAsync();
        }
        else throw new ManagementException(400, "Unknown command");
        return new(1, 0, 0);
    }

    private void Record(Command command, bool success, string detail)
    {
        AddAudit(new(DateTimeOffset.UtcNow, command.Action, command.Target, success, detail));
        _logger.LogInformation("Finesse audit: {Action} {Target}, success={Success}", command.Action, command.Target, success);
    }

    private void AddAudit(AuditEntry entry)
    {
        lock (_auditGate)
        {
            _audit.Enqueue(entry);
            while (_audit.Count > 5000) _audit.TryDequeue(out _);
            if (!_auditPersistenceAvailable) return;
            try { _auditStore.Save(_audit.Reverse().ToArray()); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _auditPersistenceAvailable = false;
                _logger.LogError(ex, "Finesse audit history could not be saved; new actions remain in memory until restart.");
            }
        }
    }
}
