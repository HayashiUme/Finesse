using Impostor.Api.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Finesse.Plugin;

public sealed class FinessePluginStartup : IPluginStartup
{
    public void ConfigureHost(IHostBuilder host)
    {
    }

    public void ConfigureServices(IServiceCollection services)
    {
        services.AddSingleton(FinesseOptions.Load());
        services.AddSingleton<AuthenticationService>();
        services.AddSingleton<SnapshotService>();
        services.AddSingleton<ManagementService>();
        services.AddHostedService(provider => provider.GetRequiredService<ManagementService>());
        services.AddHostedService<FinesseHttpService>();
    }
}
