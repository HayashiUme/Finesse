using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;
using Impostor.Api;
using Impostor.Api.Net;
using Impostor.Api.Net.Custom;
using Impostor.Api.Net.Messages;
using Impostor.Hazel.Abstractions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

public sealed class ReportService : BackgroundService, ICustomRootMessage
{
    private static readonly string[] Reasons = ["InappropriateName", "InappropriateChat", "Cheating_Hacking", "Harassment_Misconduct"];
    private readonly object _gate = new();
    private readonly List<ReportDto> _reports = [];
    private readonly ConditionalWeakTable<IClient, ReportCooldown> _cooldowns = new();
    private readonly Channel<bool> _saveRequests = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });
    private readonly ICustomMessageManager<ICustomRootMessage> _messages;
    private readonly ILogger<ReportService> _logger;
    private readonly IMessageWriterProvider _writers;
    private readonly string _path;
    private IDisposable? _registration;
    private bool _persistenceAvailable = true;

    public ReportService(ICustomMessageManager<ICustomRootMessage> messages, IMessageWriterProvider writers, ILogger<ReportService> logger, string? path = null)
    {
        _messages = messages;
        _writers = writers;
        _logger = logger;
        _path = path ?? Path.Combine(AppContext.BaseDirectory, "finesse-reports.json");
        try
        {
            if (File.Exists(_path)) _reports.AddRange((JsonSerializer.Deserialize<ReportDto[]>(File.ReadAllText(_path), JsonDefaults.Options) ?? []).Take(500));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            _persistenceAvailable = false;
            _logger.LogWarning(ex, "Finesse could not load report history at {Path}. Existing history will not be overwritten.", _path);
        }
    }

    public byte Id => MessageFlags.ReportPlayer;

    public void Enable()
    {
        lock (_gate)
        {
            if (_registration != null) return;
            try { _registration = _messages.Register(this); }
            catch (ImpostorException ex)
            {
                _logger.LogWarning(ex, "Finesse report reception is unavailable: another plugin has registered ReportPlayer.");
            }
        }
    }

    public void Disable()
    {
        lock (_gate)
        {
            _registration?.Dispose();
            _registration = null;
        }
    }

    public ReportFeedDto GetRecent()
    {
        lock (_gate) return new(_registration != null, _persistenceAvailable, _reports.Take(200).ToArray());
    }

    public async ValueTask HandleMessageAsync(IClient client, IMessageReader reader, MessageType messageType)
    {
        if (reader.Length - reader.Position < 6) return;
        var code = reader.ReadInt32();
        uint packedId = 0;
        var complete = false;
        for (var index = 0; index < 5 && reader.Position < reader.Length; index++)
        {
            var part = reader.ReadByte();
            if (index == 4 && part > 15) return;
            packedId |= (uint)(part & 127) << (index * 7);
            if ((part & 128) == 0) { complete = true; break; }
        }
        if (!complete) return;
        var reportedId = unchecked((int)packedId);
        if (reader.Position >= reader.Length) return;
        var reason = reader.ReadByte();
        if (reason >= Reasons.Length) return;
        var game = client.Player?.Game;
        if (game == null || game.Code.Value != code) return;
        var target = game.Players.FirstOrDefault(player => player.Client.Id == reportedId)?.Client;
        byte outcome = 2;
        if (target != null && target.Id != client.Id)
        {
            var cooldown = _cooldowns.GetOrCreateValue(client);
            lock (cooldown)
            {
                var now = Environment.TickCount64;
                if (cooldown.LastReport is { } last && now - last < 30_000) outcome = 3;
                else
                {
                    cooldown.LastReport = now;
                    var entry = new ReportDto(DateTimeOffset.UtcNow, game.Code.Code, client.Name, client.FriendCode, target.Name, target.FriendCode, Reasons[reason], "Reported");
                    lock (_gate)
                    {
                        _reports.Insert(0, entry);
                        if (_reports.Count > 500) _reports.RemoveAt(_reports.Count - 1);
                    }
                    _saveRequests.Writer.TryWrite(true);
                    outcome = 4;
                }
            }
        }
        using var response = _writers.Get(MessageType.Reliable);
        response.StartMessage(MessageFlags.ReportPlayer);
        response.WritePacked(reportedId);
        response.Write((int)reason);
        response.Write(outcome);
        response.Write(target?.Name ?? string.Empty);
        response.EndMessage();
        if (client.Connection is { } connection) await connection.SendAsync(response);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var _ in _saveRequests.Reader.ReadAllAsync(stoppingToken))
            {
                await SaveAsync();
                await Task.Delay(1000, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally
        {
            if (_saveRequests.Reader.TryRead(out _)) await SaveAsync();
        }
    }

    private async Task SaveAsync()
    {
        ReportDto[] reports;
        lock (_gate)
        {
            if (!_persistenceAvailable) return;
            reports = _reports.ToArray();
        }
        var temporary = _path + ".tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(reports, JsonDefaults.Options));
            File.Move(temporary, _path, true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            lock (_gate) _persistenceAvailable = false;
            _logger.LogWarning(ex, "Finesse could not save reports at {Path}; new reports remain in memory until restart.", _path);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        Disable();
        _saveRequests.Writer.TryComplete();
        await base.StopAsync(cancellationToken);
    }

    public override void Dispose() { Disable(); base.Dispose(); }

    private sealed class ReportCooldown { public long? LastReport; }
}
