using System.Collections.Concurrent;
using System.Threading.Channels;
using Impostor.Api.Games.Managers;
using Impostor.Api.Innersloth;
using Impostor.Api.Net.Manager;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

public sealed record AuditEntry(DateTimeOffset Timestamp, string Action, string Target, bool Success, string Detail, string? Location = null);
public sealed class ManagementException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

public sealed class ManagementService(IGameManager games, IClientManager clients, ILogger<ManagementService> logger) : BackgroundService
{
    private sealed record Command(string Action, string Target, bool? IsPublic, TaskCompletionSource Completion, CancellationToken RequestToken);
    private readonly Channel<Command> _commands = Channel.CreateBounded<Command>(new BoundedChannelOptions(64) { SingleReader = true });
    private readonly ConcurrentQueue<AuditEntry> _audit = new();

    public AuditEntry[] GetAudit() => _audit.Reverse().ToArray();

    public void RecordPanelLogin(string ip, string? location, string username, bool success, string detail)
    {
        AddAudit(new(DateTimeOffset.UtcNow, "login", $"{username} · {ip}", success, detail, location));
        logger.LogInformation("Finesse panel login for {Username} from {Ip} ({Location}), success={Success}", username, ip, location ?? "location unavailable", success);
    }

    public async Task ExecuteCommandAsync(string action, string target, bool? isPublic, CancellationToken cancellationToken)
    {
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_commands.Writer.TryWrite(new Command(action, target, isPublic, completion, cancellationToken)))
            throw new ManagementException(503, "Command queue is full or shutting down; try again later.");
        await completion.Task;
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
                    await PerformAsync(command);
                    Record(command, true, "Completed");
                    command.Completion.TrySetResult();
                }
                catch (Exception ex)
                {
                    Record(command, false, ex is ManagementException ? ex.Message : "Operation failed");
                    logger.LogWarning(ex, "Finesse command {Action} for {Target} failed", command.Action, command.Target);
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

    private async Task PerformAsync(Command command)
    {
        if (command.Action is "kick" or "ban")
        {
            var client = clients.Clients.FirstOrDefault(c => c.Id.ToString() == command.Target)
                ?? throw new ManagementException(404, "Player not found");
            if (command.Action == "ban")
            {
                var player = client.Player ?? throw new ManagementException(409, "Player must be in a room for a room ban");
                await player.BanAsync();
            }
            else if (client.Player is { } player) await player.KickAsync();
            else await client.DisconnectAsync(DisconnectReason.Custom, "Disconnected by administrator");
            return;
        }

        var game = games.Games.FirstOrDefault(g => g.Code.Code.Equals(command.Target, StringComparison.OrdinalIgnoreCase))
            ?? throw new ManagementException(404, "Room not found");
        if (command.Action == "privacy" && command.IsPublic is { } isPublic) await game.SetPrivacyAsync(isPublic);
        else if (command.Action == "close")
        {
            foreach (var player in game.Players.ToArray()) await player.KickAsync();
        }
        else throw new ManagementException(400, "Unknown command");
    }

    private void Record(Command command, bool success, string detail)
    {
        AddAudit(new(DateTimeOffset.UtcNow, command.Action, command.Target, success, detail));
        logger.LogInformation("Finesse audit: {Action} {Target}, success={Success}", command.Action, command.Target, success);
    }

    private void AddAudit(AuditEntry entry)
    {
        _audit.Enqueue(entry);
        while (_audit.Count > 200) _audit.TryDequeue(out _);
    }
}
