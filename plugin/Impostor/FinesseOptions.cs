using System.Security.Cryptography;
using System.Text.Json;

namespace Finesse.Plugin;

public sealed class FinesseOptions
{
    public required string Url { get; init; }

    public required string ApiKey { get; init; }

    public string[] AllowedOrigins { get; init; } = [];

    public static FinesseOptions Load(string? configPath = null)
    {
        var path = configPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "finesse.json");
        var file = LoadOrCreate(path);
        var url = Environment.GetEnvironmentVariable("FINESSE_URL") ?? file.Url ?? "http://127.0.0.1:8097/";
        var key = Environment.GetEnvironmentVariable("FINESSE_API_KEY") ?? file.ApiKey;

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttp ||
            (uri.Host != "127.0.0.1" && !uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) ||
            uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new InvalidOperationException("Finesse must bind to an HTTP loopback address, such as http://127.0.0.1:8097/.");
        }

        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("FINESSE_API_KEY must not be empty.");
        var origins = file.AllowedOrigins ?? [];
        foreach (var origin in origins)
        {
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var allowed) ||
                allowed.Scheme is not ("http" or "https") || allowed.GetLeftPart(UriPartial.Authority) != origin)
                throw new InvalidOperationException($"Invalid allowedOrigins entry in '{path}': use an HTTP(S) origin without a trailing slash.");
        }
        return new FinesseOptions
        {
            Url = url.EndsWith('/') ? url : url + "/",
            ApiKey = key,
            AllowedOrigins = origins,
        };
    }

    public bool AllowsOrigin(string? origin) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        ((uri.Scheme == "http" && uri.IsLoopback) ||
         AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase));

    private static FileOptions LoadOrCreate(string path)
    {
        FileOptions options;
        try
        {
            options = File.Exists(path)
                ? JsonSerializer.Deserialize<FileOptions>(File.ReadAllText(path), JsonDefaults.Options)
                    ?? throw new InvalidOperationException($"Finesse configuration at '{path}' is empty.")
                : new FileOptions();
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Cannot read Finesse configuration at '{path}': invalid JSON.", ex);
        }
        var changed = !File.Exists(path) || string.IsNullOrWhiteSpace(options.ApiKey) || string.IsNullOrWhiteSpace(options.Url);
        if (string.IsNullOrWhiteSpace(options.Url)) options.Url = "http://127.0.0.1:8097/";
        if (string.IsNullOrWhiteSpace(options.ApiKey)) options.ApiKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        if (changed)
        {
            var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temporary, JsonSerializer.Serialize(options, new JsonSerializerOptions(JsonDefaults.Options) { WriteIndented = true }));
                File.Move(temporary, path, true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                throw new InvalidOperationException($"Cannot create Finesse configuration at '{path}'. Check directory write permissions.", ex);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        return options;
    }

    private sealed class FileOptions
    {
        public string? Url { get; set; }

        public string? ApiKey { get; set; }

        public string[] AllowedOrigins { get; set; } = [];

        [System.Text.Json.Serialization.JsonExtensionData]
        public Dictionary<string, JsonElement>? Extra { get; set; }
    }
}
