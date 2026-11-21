using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using Impostor.Api.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Finesse.Plugin;

public sealed record PluginInfoDto(string Id, string Name, string Author, string Version, bool Enabled, bool FilePresent, string? FileName, bool CanManage);

public sealed class PluginManagementService(IServiceProvider services)
{
    private const string FinessePluginId = "gg.finesse.dashboard";
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ConcurrentDictionary<string, bool> _enabled = new(StringComparer.Ordinal);

    public PluginInfoDto[] GetPlugins() => GetEntries().Select(ToDto).OrderBy(plugin => plugin.Name, StringComparer.OrdinalIgnoreCase).ToArray();

    public async Task<PluginInfoDto> SetEnabledAsync(string id, bool enabled)
    {
        await _gate.WaitAsync();
        try
        {
            var entry = Find(id);
            if (entry.Id == FinessePluginId) throw new ManagementException(409, "pluginSelfManagementBlocked");
            if (!entry.FilePresent) throw new ManagementException(409, "pluginFileMissing");
            if (entry.Instance is not IPlugin instance) throw new ManagementException(409, "pluginInstanceUnavailable");
            if (entry.Enabled == enabled) return ToDto(entry);

            if (enabled) await instance.EnableAsync();
            else await instance.DisableAsync();
            _enabled[id] = enabled;
            return ToDto(entry with { Enabled = enabled });
        }
        finally { _gate.Release(); }
    }

    public async Task<PluginInfoDto> DeleteAsync(string id)
    {
        await _gate.WaitAsync();
        try
        {
            var entry = Find(id);
            if (entry.Id == FinessePluginId) throw new ManagementException(409, "pluginSelfManagementBlocked");
            if (string.IsNullOrEmpty(entry.AssemblyPath)) throw new ManagementException(409, "pluginFileUnavailable");
            if (entry.Enabled && entry.Instance is IPlugin instance)
            {
                await instance.DisableAsync();
                _enabled[id] = false;
            }
            try { if (File.Exists(entry.AssemblyPath)) File.Delete(entry.AssemblyPath); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                throw new ManagementException(409, "pluginDeleteFailed");
            }
            return ToDto(entry with { Enabled = false, FilePresent = File.Exists(entry.AssemblyPath) });
        }
        finally { _gate.Release(); }
    }

    private PluginEntry Find(string id) => GetEntries().FirstOrDefault(plugin => plugin.Id == id)
        ?? throw new ManagementException(404, "pluginNotFound");

    private PluginEntry[] GetEntries()
    {
        var loaderType = AppDomain.CurrentDomain.GetAssemblies()
            .Select(assembly => assembly.GetType("Impostor.Server.Plugins.PluginLoaderService", false))
            .FirstOrDefault(type => type is not null)
            ?? throw new ManagementException(503, "pluginManagerUnavailable");
        var loader = services.GetService(loaderType)
            ?? throw new ManagementException(503, "pluginManagerUnavailable");
        var plugins = loaderType.GetProperty("Plugins")?.GetValue(loader) as IEnumerable
            ?? throw new ManagementException(503, "pluginManagerUnavailable");

        return plugins.Cast<object>().Select(plugin =>
        {
            var type = Get<Type>(plugin, "PluginType");
            var instance = Get<IPlugin>(plugin, "Instance");
            var assemblyPath = type?.Assembly.Location;
            var id = Get<string>(plugin, "Id") ?? string.Empty;
            var enabled = _enabled.TryGetValue(id, out var value) ? value : instance is not null;
            return new PluginEntry(
                id,
                Get<string>(plugin, "Name") ?? type?.Assembly.GetName().Name ?? id,
                Get<string>(plugin, "Author") ?? string.Empty,
                Get<string>(plugin, "Version") ?? type?.Assembly.GetName().Version?.ToString() ?? string.Empty,
                enabled,
                instance,
                assemblyPath,
                !string.IsNullOrWhiteSpace(assemblyPath) && File.Exists(assemblyPath));
        }).ToArray();
    }

    private static T? Get<T>(object source, string property) =>
        source.GetType().GetProperty(property, BindingFlags.Instance | BindingFlags.Public)?.GetValue(source) is T value ? value : default;

    private static PluginInfoDto ToDto(PluginEntry entry) => new(
        entry.Id, entry.Name, entry.Author, entry.Version, entry.Enabled, entry.FilePresent,
        entry.AssemblyPath is null ? null : Path.GetFileName(entry.AssemblyPath), entry.Id != FinessePluginId);

    private sealed record PluginEntry(string Id, string Name, string Author, string Version, bool Enabled, IPlugin? Instance, string? AssemblyPath, bool FilePresent);
}
