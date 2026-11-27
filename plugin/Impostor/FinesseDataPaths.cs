using System.Text.Json;

namespace Finesse.Plugin;

public static class FinesseDataPaths
{
    public static string GetFile(string fileName, string legacyFileName, string? baseDirectory = null)
    {
        var basePath = baseDirectory ?? AppContext.BaseDirectory;
        var directory = Path.Combine(basePath, "Finesse");
        Directory.CreateDirectory(directory);

        var path = Path.Combine(directory, fileName);
        var legacyPath = Path.Combine(basePath, legacyFileName);
        if (!File.Exists(path) && File.Exists(legacyPath)) File.Move(legacyPath, path);
        return path;
    }
}

internal interface IDataStore<T>
{
    T Load(T fallback);
    void Save(T value);
    Task SaveAsync(T value, CancellationToken cancellationToken = default);
}

internal sealed class JsonFileDataStore<T>(string path, bool writeIndented = false) : IDataStore<T>
{
    private readonly JsonSerializerOptions _options = writeIndented
        ? new JsonSerializerOptions(JsonDefaults.Options) { WriteIndented = true }
        : JsonDefaults.Options;

    public T Load(T fallback)
    {
        if (!File.Exists(path)) return fallback;
        return JsonSerializer.Deserialize<T>(File.ReadAllText(path), _options)
            ?? throw new InvalidDataException($"Invalid JSON data at '{path}'.");
    }

    public void Save(T value)
    {
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(temporary, JsonSerializer.Serialize(value, _options));
            File.Move(temporary, path, true);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    public async Task SaveAsync(T value, CancellationToken cancellationToken = default)
    {
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(value, _options), cancellationToken);
            File.Move(temporary, path, true);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }
}
