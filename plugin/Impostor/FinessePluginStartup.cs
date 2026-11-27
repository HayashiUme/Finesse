using Impostor.Api.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Reflection;
using System.Runtime.Loader;

namespace Finesse.Plugin;

public sealed class FinessePluginStartup : IPluginStartup
{
    private const string MoonSharpResourceName = "Finesse.Plugin.Dependencies.MoonSharp.Interpreter.dll";
    private static int _resolverRegistered;

    public void ConfigureHost(IHostBuilder host)
    {
    }

    public void ConfigureServices(IServiceCollection services)
    {
        if (Interlocked.Exchange(ref _resolverRegistered, 1) == 0)
            AssemblyLoadContext.Default.Resolving += ResolveEmbeddedDependency;

        services.AddSingleton(FinesseOptions.Load());
        services.AddSingleton<AuthenticationService>();
        services.AddSingleton<SnapshotService>();
        services.AddSingleton<ProcessMetricsService>();
        services.AddSingleton<ReportService>();
        services.AddSingleton<BanService>();
        services.AddHostedService(provider => provider.GetRequiredService<ReportService>());
        services.AddSingleton<ManagementService>();
        services.AddHostedService(provider => provider.GetRequiredService<ManagementService>());
        services.AddSingleton<PluginManagementService>();
        services.AddSingleton<InterfaceService>();
        services.AddSingleton<ExtensionPluginService>();
        services.AddHostedService<FinesseHttpService>();
    }

    private static Assembly? ResolveEmbeddedDependency(AssemblyLoadContext context, AssemblyName assemblyName)
    {
        if (!string.Equals(assemblyName.Name, "MoonSharp.Interpreter", StringComparison.Ordinal))
            return null;

        using var stream = typeof(FinessePluginStartup).Assembly.GetManifestResourceStream(MoonSharpResourceName);
        return stream is null ? null : context.LoadFromStream(stream);
    }
}
