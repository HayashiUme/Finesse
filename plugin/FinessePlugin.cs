using Impostor.Api.Plugins;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

[ImpostorPlugin("gg.finesse.dashboard")]
public sealed class FinessePlugin : PluginBase
{
    private readonly ILogger<FinessePlugin> _logger;

    public FinessePlugin(ILogger<FinessePlugin> logger) => _logger = logger;

    public override ValueTask EnableAsync()
    {
        _logger.LogInformation("Finesse management API is enabled.");
        return ValueTask.CompletedTask;
    }
}
