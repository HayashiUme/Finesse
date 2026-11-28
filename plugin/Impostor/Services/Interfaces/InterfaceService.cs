using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Finesse.Plugin;

public sealed record InterfaceApiKeyDto(string Id, string Name, string Prefix, string[] Scopes, DateTimeOffset CreatedAt);
public sealed record InterfaceApiKeyCreatedDto(InterfaceApiKeyDto Key, string Secret);
public sealed record InterfaceSettingsDto(IReadOnlyList<InterfaceApiKeyDto> ApiKeys, bool HelloPageEnabled);

public sealed class InterfaceService
{
    private static readonly string[] AvailableScopes = ["games", "monitor"];
    private readonly object _gate = new();
    private readonly IDataStore<InterfaceStore> _dataStore;
    private readonly string _storePath;
    private readonly string _helloPath;
    private InterfaceStore _store;

    public InterfaceService()
    {
        var directory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Finesse");
        Directory.CreateDirectory(directory);
        _storePath = Path.Combine(directory, "interface.json");
        _helloPath = Path.Combine(directory, "Pages", "index.html");
        _dataStore = new JsonFileDataStore<InterfaceStore>(_storePath, writeIndented: true);
        try { _store = _dataStore.Load(new InterfaceStore()); }
        catch (Exception ex) when (ex is JsonException or InvalidDataException)
        {
            throw new InvalidOperationException($"Cannot read Finesse interface settings '{_storePath}': invalid JSON.", ex);
        }
    }

    public InterfaceSettingsDto GetSettings()
    {
        lock (_gate) return ToDto(_store) with { HelloPageEnabled = File.Exists(_helloPath) };
    }

    public InterfaceApiKeyCreatedDto CreateApiKey(string? name, IEnumerable<string>? requestedScopes)
    {
        var normalizedName = name?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName) || normalizedName.Length > 64)
            throw new ManagementException(400, "interfaceKeyNameInvalid");
        var scopes = requestedScopes?.Distinct(StringComparer.Ordinal).ToArray() ?? [];
        if (scopes.Length == 0 || scopes.Any(scope => !AvailableScopes.Contains(scope, StringComparer.Ordinal)))
            throw new ManagementException(400, "interfaceKeyScopesInvalid");

        var secret = "sk-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var entry = new StoredApiKey(Guid.NewGuid().ToString("N"), normalizedName, Hash(secret), secret[..10], scopes, DateTimeOffset.UtcNow);
        lock (_gate)
        {
            if (_store.ApiKeys.Count >= 100) throw new ManagementException(409, "interfaceKeyLimitReached");
            Save(_store with { ApiKeys = [.. _store.ApiKeys, entry] });
        }
        return new InterfaceApiKeyCreatedDto(ToDto(entry), secret);
    }

    public void DeleteApiKey(string id)
    {
        lock (_gate)
        {
            if (!_store.ApiKeys.Any(key => key.Id == id)) throw new ManagementException(404, "interfaceKeyNotFound");
            Save(_store with { ApiKeys = _store.ApiKeys.Where(key => key.Id != id).ToList() });
        }
    }

    public bool IsAuthorized(string? secret, string scope)
    {
        if (string.IsNullOrWhiteSpace(secret) || secret.Length > 128) return false;
        var hash = Hash(secret);
        lock (_gate)
            return _store.ApiKeys.Any(key => key.Scopes.Contains(scope, StringComparer.Ordinal) && FixedTimeEquals(key.SecretHash, hash));
    }

    public bool HasHelloPage => File.Exists(_helloPath);

    public string? ReadHelloPage() => File.Exists(_helloPath) ? File.ReadAllText(_helloPath, Encoding.UTF8) : null;

    public void SaveHelloPage(string? html)
    {
        if (html is null)
        {
            if (File.Exists(_helloPath)) File.Delete(_helloPath);
            return;
        }
        if (Encoding.UTF8.GetByteCount(html) > 512_000 || string.IsNullOrWhiteSpace(html) || !html.Contains("<html", StringComparison.OrdinalIgnoreCase))
            throw new ManagementException(400, "helloPageInvalid");
        lock (_gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_helloPath)!);
            var temp = _helloPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temp, html, new UTF8Encoding(false));
                File.Move(temp, _helloPath, true);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
    }

    private static InterfaceSettingsDto ToDto(InterfaceStore store) => new(
        store.ApiKeys.Select(ToDto).ToArray(), false);

    private static InterfaceApiKeyDto ToDto(StoredApiKey key) => new(key.Id, key.Name, key.Prefix,
        [.. key.Scopes.Where(scope => AvailableScopes.Contains(scope, StringComparer.Ordinal))], key.CreatedAt);

    private void Save(InterfaceStore next)
    {
        try { _dataStore.Save(next); _store = next; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new ManagementException(500, "interfaceStoreUnavailable");
        }
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static bool FixedTimeEquals(string left, string right)
    {
        var a = Convert.FromHexString(left);
        var b = Convert.FromHexString(right);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    private sealed record StoredApiKey(string Id, string Name, string SecretHash, string Prefix, string[] Scopes, DateTimeOffset CreatedAt);

    private sealed record InterfaceStore
    {
        public List<StoredApiKey> ApiKeys { get; init; } = [];
    }
}
