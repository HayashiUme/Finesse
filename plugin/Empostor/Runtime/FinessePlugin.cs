using Empostor.Api.Plugins;
using Microsoft.Extensions.Logging;

namespace Finesse.Plugin;

[EmpostorPlugin("gg.finesse.dashboard")]
public sealed class FinessePlugin : PluginBase
{
    private readonly ILogger<FinessePlugin> _logger;
    private readonly ReportService _reports;
    private readonly BanService _bans;

    public FinessePlugin(ILogger<FinessePlugin> logger, ReportService reports, BanService bans)
    {
        _logger = logger;
        _reports = reports;
        _bans = bans;
    }

    public override ValueTask EnableAsync()
    {
        _reports.Enable();
        _bans.Enable();
        _logger.LogInformation("Finesse management API is enabled.");
        return ValueTask.CompletedTask;
    }

    public override ValueTask DisableAsync()
    {
        _reports.Disable();
        _bans.Disable();
        return ValueTask.CompletedTask;
    }
}
