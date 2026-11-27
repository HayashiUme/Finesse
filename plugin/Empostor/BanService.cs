using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Empostor.Api.Events;
using Empostor.Api.Events.Client;
using Empostor.Api.Events.Managers;
using Empostor.Api.Games;
using Empostor.Api.Innersloth;
using Empostor.Api.Net;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

public sealed record BanEntry(string Id, string Kind, string Value, string Reason, DateTimeOffset CreatedAt, DateTimeOffset? ExpiresAt);
public sealed record BanRequest(string? Kind, string? Value, string? Reason, int? DurationMinutes);
public sealed record BanFeed(bool Available, IReadOnlyList<BanEntry> Entries);

// Writes run on the management queue, never in a game event callback.
public sealed class BanService : IEventListener, IDisposable
{
    private readonly object _gate = new();
    private readonly object _writeGate = new();
    private readonly IEventManager _events;
    private readonly ILogger<BanService> _logger;
    private readonly string _path;
    private readonly IDataStore<List<BanEntry>> _store;
    private List<BanEntry> _entries = [];
    private IDisposable? _registration;
    private bool _available = true;

    public BanService(IEventManager events, ILogger<BanService> logger, string? path = null)
    {
        _events = events; _logger = logger;
        _path = path ?? FinesseDataPaths.GetFile("bans.json", "finesse-bans.json");
        _store = new JsonFileDataStore<List<BanEntry>>(_path);
        try
        {
            var entries = _store.Load([]);
            if (entries.Count > 5000 || entries.Any(e => !Guid.TryParseExact(e.Id, "N", out _) ||
                Normalize(e.Kind, e.Value) != e.Value || e.Reason is null || e.Reason.Length > 200 || e.Reason.Any(char.IsControl)) ||
                entries.Select(e => e.Id).Distinct().Count() != entries.Count)
                throw new InvalidDataException("Invalid ban history");
            _entries = entries;
        }
        catch (Exception ex)
        {
            _available = false;
            _logger.LogError(ex, "Finesse ban history could not be loaded. Repair {Path} before editing bans.", _path);
        }
    }

    public void Enable() => _registration ??= _events.RegisterListener(this);
    public void Disable() { _registration?.Dispose(); _registration = null; }
    public void Dispose() => Disable();

    public BanFeed GetAll()
    {
        lock (_gate) return new(_available, _entries.Where(IsActive).OrderByDescending(e => e.CreatedAt).ToArray());
    }

    public static string Normalize(string? kind, string? value)
    {
        value = value?.Trim();
        if (kind == "ip" && IPAddress.TryParse(value, out var ip))
            return (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).ToString();
        if (kind == "friendCode" && value is not null && Regex.IsMatch(value, "^[a-zA-Z0-9#_-]{3,64}$", RegexOptions.CultureInvariant))
            return value.ToLowerInvariant();
        throw new ManagementException(400, "banInvalid");
    }

    public BanEntry Add(BanRequest request)
    {
        var value = Normalize(request.Kind, request.Value);
        if (request.DurationMinutes is < 1 or > 525600 || request.Reason?.Length > 200 || request.Reason?.Any(char.IsControl) == true)
            throw new ManagementException(400, "banInvalid");
        var now = DateTimeOffset.UtcNow;
        var entry = new BanEntry(Guid.NewGuid().ToString("N"), request.Kind!, value, request.Reason?.Trim() ?? "",
            now, request.DurationMinutes is { } duration ? now.AddMinutes(duration) : null);
        lock (_writeGate)
        {
            List<BanEntry> next;
            lock (_gate) next = _entries.Where(e => IsActive(e) && !(e.Kind == entry.Kind && e.Value == value)).ToList();
            if (next.Count >= 5000) throw new ManagementException(409, "banLimit");
            next.Add(entry);
            Save(next);
            lock (_gate) _entries = next;
        }
        return entry;
    }

    public void Remove(string id)
    {
        lock (_writeGate)
        {
            List<BanEntry> next;
            lock (_gate)
            {
                if (!_entries.Any(e => e.Id == id)) throw new ManagementException(404, "Ban not found");
                next = _entries.Where(e => e.Id != id).ToList();
            }
            Save(next);
            lock (_gate) _entries = next;
        }
    }

    private void Save(List<BanEntry> entries)
    {
        if (!_available) throw new ManagementException(503, "banStoreUnavailable");
        try
        {
            _store.Save(entries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Finesse bans could not be saved to {Path}", _path);
            throw new ManagementException(503, "banStoreUnavailable");
        }
    }

    private static bool IsActive(BanEntry entry) => entry.ExpiresAt is null || entry.ExpiresAt > DateTimeOffset.UtcNow;

    public BanEntry? Match(IClient client)
    {
        var ip = client.Connection?.EndPoint?.Address;
        var address = ip is null ? null : (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).ToString();
        lock (_gate) return _entries.FirstOrDefault(e => IsActive(e) && (e.Kind == "ip" ? e.Value == address :
            string.Equals(e.Value, client.FriendCode, StringComparison.OrdinalIgnoreCase)));
    }

    // Empostor invokes higher priorities first; check after identity providers.
    [EventListener(EventPriority.Lowest)]
    public async ValueTask OnClientConnected(IClientConnectedEvent ev)
    {
        if (Match(ev.Client) is { } entry)
        {
            await ev.Client.DisconnectAsync(DisconnectReason.Custom, "Banned by server administrator" +
                (entry.Reason.Length > 0 ? ": " + entry.Reason : ""));
        }
    }

    [EventListener(EventPriority.Lowest)]
    public void OnGamePlayerJoining(IGamePlayerJoiningEvent ev)
    {
        // Recheck identities populated after the initial connection handshake.
        if (Match(ev.Player.Client) is not null)
            ev.JoinResult = GameJoinResult.CreateCustomError("Banned by server administrator");
    }
}
