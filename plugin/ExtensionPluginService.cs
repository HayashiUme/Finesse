using System.Text;
using System.Text.Json;
using MoonSharp.Interpreter;

namespace Finesse.Plugin;

public sealed record ExtensionSummary(string Id, string Name, string Version, string Description, IReadOnlyList<ExtensionPage> Pages, IReadOnlyList<ExtensionAction> Actions);
public sealed record ExtensionPage(string Id, string Title, string? Description, string Handler, IReadOnlyList<ExtensionSection> Sections);
public sealed record ExtensionSection(string Type, string Title, string? DataPath, IReadOnlyList<string>? Columns);
public sealed record ExtensionAction(string Id, string Label, string Handler, bool Mutating, string? Confirm);
public sealed record ExtensionPageResult(string PluginId, string PageId, JsonElement Data);

public sealed class ExtensionPluginService
{
    private const int MaxResponseBytes = 1_000_000;
    private static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(12) };
    private readonly string _pluginsDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Finesse", "plugins");

    public ExtensionPluginService() => Directory.CreateDirectory(_pluginsDirectory);

    public IReadOnlyList<ExtensionSummary> List()
    {
        var result = new List<ExtensionSummary>();
        foreach (var directory in Directory.EnumerateDirectories(_pluginsDirectory))
        {
            try { result.Add(Load(directory).Manifest); }
            catch (Exception ex) when (ex is IOException or JsonException or InvalidDataException or UnauthorizedAccessException) { }
        }
        return result.OrderBy(plugin => plugin.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public ExtensionPageResult LoadPage(string pluginId, string pageId)
    {
        var plugin = Find(pluginId);
        var page = plugin.Manifest.Pages.SingleOrDefault(candidate => candidate.Id == pageId)
            ?? throw new ManagementException(404, "extensionPageNotFound");
        return new ExtensionPageResult(plugin.Manifest.Id, page.Id, Invoke(plugin, page.Handler, null, allowMutation: false));
    }

    public JsonElement RunAction(string pluginId, string actionId, JsonElement payload)
    {
        var plugin = Find(pluginId);
        var action = plugin.Manifest.Actions.SingleOrDefault(candidate => candidate.Id == actionId)
            ?? throw new ManagementException(404, "extensionActionNotFound");
        return Invoke(plugin, action.Handler, payload, action.Mutating);
    }

    public ExtensionAction GetAction(string pluginId, string actionId) =>
        Find(pluginId).Manifest.Actions.SingleOrDefault(candidate => candidate.Id == actionId)
        ?? throw new ManagementException(404, "extensionActionNotFound");

    private LoadedExtension Find(string id)
    {
        if (!IsIdentifier(id)) throw new ManagementException(404, "extensionNotFound");
        foreach (var directory in Directory.EnumerateDirectories(_pluginsDirectory))
        {
            try
            {
                var plugin = Load(directory);
                if (plugin.Manifest.Id == id) return plugin;
            }
            catch (Exception ex) when (ex is IOException or JsonException or InvalidDataException or UnauthorizedAccessException) { }
        }
        throw new ManagementException(404, "extensionNotFound");
    }

    private static LoadedExtension Load(string directory)
    {
        var manifestPath = Path.Combine(directory, "plugin.json");
        var scriptPath = Path.Combine(directory, "plugin.lua");
        var manifestInfo = new FileInfo(manifestPath);
        var scriptInfo = new FileInfo(scriptPath);
        if (!manifestInfo.Exists || !scriptInfo.Exists) throw new InvalidDataException("Extension package is incomplete.");
        if (manifestInfo.Length > 128_000 || scriptInfo.Length > 256_000) throw new InvalidDataException("Extension package is too large.");
        var manifest = JsonSerializer.Deserialize<ExtensionManifest>(File.ReadAllBytes(manifestPath), JsonDefaults.Options)
            ?? throw new InvalidDataException("Extension manifest is empty.");
        Validate(manifest);
        return new LoadedExtension(directory, manifest.ToSummary(), File.ReadAllText(scriptPath, Encoding.UTF8), manifest.AllowedHosts);
    }

    private static void Validate(ExtensionManifest manifest)
    {
        if (!IsIdentifier(manifest.Id) || string.IsNullOrWhiteSpace(manifest.Name) || manifest.Name.Length > 80 ||
            string.IsNullOrWhiteSpace(manifest.Version) || manifest.Version.Length > 32 || manifest.Pages is null || manifest.Actions is null || manifest.AllowedHosts is null || manifest.Pages.Count > 16 || manifest.Actions.Count > 32)
            throw new InvalidDataException("Extension manifest fields are invalid.");
        if (manifest.Pages.Select(page => page.Id).Distinct(StringComparer.Ordinal).Count() != manifest.Pages.Count ||
            manifest.Actions.Select(action => action.Id).Distinct(StringComparer.Ordinal).Count() != manifest.Actions.Count)
            throw new InvalidDataException("Extension IDs must be unique.");
        foreach (var page in manifest.Pages)
        {
            if (!IsIdentifier(page.Id) || !IsIdentifier(page.Handler) || string.IsNullOrWhiteSpace(page.Title) || page.Title.Length > 100 || page.Sections.Count > 16)
                throw new InvalidDataException("Extension page fields are invalid.");
            foreach (var section in page.Sections)
                if (section.Type is not ("stats" or "table" or "json") || string.IsNullOrWhiteSpace(section.Title) || section.Title.Length > 100 || (section.Columns?.Count ?? 0) > 20)
                    throw new InvalidDataException("Extension section fields are invalid.");
        }
        foreach (var action in manifest.Actions)
            if (!IsIdentifier(action.Id) || !IsIdentifier(action.Handler) || string.IsNullOrWhiteSpace(action.Label) || action.Label.Length > 80)
                throw new InvalidDataException("Extension action fields are invalid.");
        foreach (var host in manifest.AllowedHosts)
            if (host.Length is < 1 or > 253 || host.Contains('/') || host.Contains(':') || host.Contains('*'))
                throw new InvalidDataException("allowedHosts must contain exact host names without ports.");
    }

    private JsonElement Invoke(LoadedExtension plugin, string handler, JsonElement? payload, bool allowMutation)
    {
        var script = new Script(CoreModules.Preset_SoftSandbox);
        var finesse = new Table(script);
        finesse["setting"] = DynValue.NewCallback((_, args) => DynValue.NewString(ReadSetting(plugin.Directory, Argument(args, 0).String)));
        finesse["request"] = DynValue.NewCallback((_, args) => DynValue.NewString(Request(plugin.AllowedHosts, args, allowMutation)));
        finesse["basic"] = DynValue.NewCallback((_, args) =>
        {
            var username = Argument(args, 0).String ?? string.Empty;
            var password = Argument(args, 1).String ?? string.Empty;
            return DynValue.NewString("Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes(username + ":" + password)));
        });
        script.Globals.Set("finesse", DynValue.NewTable(finesse));
        script.DoString(plugin.Script, null, plugin.Manifest.Id);
        var function = script.Globals.Get(handler);
        if (function.Type != DataType.Function) throw new ManagementException(500, "extensionHandlerMissing");
        var argument = payload.HasValue ? DynValue.NewString(payload.Value.GetRawText()) : DynValue.Nil;
        var value = script.Call(function, argument);
        if (value.Type != DataType.String || value.String.Length > MaxResponseBytes)
            throw new ManagementException(502, "extensionResponseInvalid");
        try
        {
            using var parsed = JsonDocument.Parse(value.String, new JsonDocumentOptions { MaxDepth = 32 });
            return parsed.RootElement.Clone();
        }
        catch (JsonException) { throw new ManagementException(502, "extensionResponseInvalid"); }
    }

    private static string ReadSetting(string directory, string? key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 64) return string.Empty;
        var path = Path.Combine(directory, "settings.json");
        if (!File.Exists(path)) return string.Empty;
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllBytes(path), new JsonDocumentOptions { MaxDepth = 8 });
            return document.RootElement.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { return string.Empty; }
    }

    private static string Request(IReadOnlyList<string> allowedHosts, CallbackArguments args, bool allowMutation)
    {
        var method = Argument(args, 0).String?.ToUpperInvariant();
        var urlText = Argument(args, 1).String;
        if (method is not ("GET" or "POST" or "PUT" or "DELETE") || (!allowMutation && method != "GET") || !Uri.TryCreate(urlText, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https") || !allowedHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase))
            throw new ScriptRuntimeException("HTTP request is outside the extension's declared allowedHosts.");
        using var request = new HttpRequestMessage(new HttpMethod(method), uri);
        var headersJson = Argument(args, 2).String;
        if (!string.IsNullOrWhiteSpace(headersJson))
        {
            using var headers = JsonDocument.Parse(headersJson, new JsonDocumentOptions { MaxDepth = 8 });
            if (headers.RootElement.ValueKind != JsonValueKind.Object) throw new ScriptRuntimeException("Headers must be a JSON object.");
            foreach (var header in headers.RootElement.EnumerateObject())
            {
                if (header.Name.Equals("Host", StringComparison.OrdinalIgnoreCase) || header.Name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) continue;
                if (!request.Headers.TryAddWithoutValidation(header.Name, header.Value.GetString()))
                    throw new ScriptRuntimeException("Invalid HTTP header.");
            }
        }
        var body = Argument(args, 3).String;
        if (body is not null)
        {
            if (Encoding.UTF8.GetByteCount(body) > 256_000) throw new ScriptRuntimeException("Request body is too large.");
            request.Content = new StringContent(body);
            request.Content.Headers.ContentType = new("application/json");
        }
        using var response = Http.Send(request, HttpCompletionOption.ResponseHeadersRead);
        if (response.Content.Headers.ContentLength > MaxResponseBytes) throw new ScriptRuntimeException("HTTP response is too large.");
        using var responseStream = response.Content.ReadAsStream();
        using var responseBuffer = new MemoryStream();
        var readBuffer = new byte[8192];
        int read;
        while ((read = responseStream.Read(readBuffer, 0, readBuffer.Length)) > 0)
        {
            if (responseBuffer.Length + read > MaxResponseBytes) throw new ScriptRuntimeException("HTTP response is too large.");
            responseBuffer.Write(readBuffer, 0, read);
        }
        var responseBody = responseBuffer.ToArray();
        var bodyText = Encoding.UTF8.GetString(responseBody);
        object bodyValue;
        try
        {
            using var parsed = JsonDocument.Parse(bodyText, new JsonDocumentOptions { MaxDepth = 32 });
            bodyValue = parsed.RootElement.Clone();
        }
        catch (JsonException) { bodyValue = bodyText; }
        return JsonSerializer.Serialize(new { status = (int)response.StatusCode, headers = response.Headers.ToDictionary(pair => pair.Key, pair => pair.Value.FirstOrDefault()), body = bodyValue });
    }

    private static bool IsIdentifier(string? value) => value is { Length: > 0 and <= 64 } && value.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '-' or '_');
    private static DynValue Argument(CallbackArguments args, int index) => args.Count > index ? args[index] : DynValue.Nil;
    private sealed record LoadedExtension(string Directory, ExtensionSummary Manifest, string Script, IReadOnlyList<string> AllowedHosts);
    private sealed class ExtensionManifest
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Version { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public List<string> AllowedHosts { get; set; } = [];
        public List<ExtensionPage> Pages { get; set; } = [];
        public List<ExtensionAction> Actions { get; set; } = [];
        public ExtensionSummary ToSummary() => new(Id, Name, Version, Description, Pages, Actions);
    }
}
