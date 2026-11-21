using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using Impostor.Api.Games;
using Impostor.Api.Games.Managers;
using Impostor.Api.Innersloth;
using Impostor.Api.Net.Manager;

namespace Finesse.Plugin;

public sealed class SnapshotService
{
    private readonly IGameManager _gameManager;
    private readonly IClientManager _clientManager;
    private readonly ProcessMetricsService _metrics;
    private readonly Stopwatch _uptime = Stopwatch.StartNew();

    public SnapshotService(IGameManager gameManager, IClientManager clientManager, ProcessMetricsService metrics)
    {
        _gameManager = gameManager;
        _clientManager = clientManager;
        _metrics = metrics;
    }

    public SnapshotDto GetSnapshot()
    {
        var games = _gameManager.Games
            .Where(game => game.GameState is not (GameStates.Ended or GameStates.Destroyed))
            .Select(ToGame)
            .Where(game => game.PlayerCount > 0 && game.Players.Count > 0 && game.HostName is not null)
            .ToArray();
        var players = _clientManager.Clients
            .Select(ToClient)
            .ToArray();
        var activeGames = games.Count(game => game.State == nameof(GameStates.Started));

        return new SnapshotDto("online", (long)_uptime.Elapsed.TotalSeconds, players.Length, activeGames, games.Length, GetPluginVersion(), games, players, _metrics.GetMetrics());
    }

    public static string GetPluginVersion() =>
        typeof(SnapshotService).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? typeof(SnapshotService).Assembly.GetName().Version?.ToString(3)
        ?? "unknown";

    private static GameDto ToGame(IGame game)
    {
        var players = game.Players.Select(ToPlayer).ToArray();
        var host = game.Host?.Client;
        var hostPlatform = host?.PlatformSpecificData?.PlatformName;
        if (string.IsNullOrWhiteSpace(hostPlatform)) hostPlatform = host?.PlatformSpecificData?.Platform.ToString() ?? "UnknownPlatform";
        return new GameDto(
            game.Code.Code,
            game.GameState.ToString(),
            game.PlayerCount,
            game.Options.MaxPlayers,
            game.IsPublic,
            host?.Name ?? "Unknown host",
            players, game.Options.Map.ToString(), game.Options.GameMode.ToString(), game.DisplayName,
            game.Code.Value, game.PublicIp.Address.ToString(), hostPlatform,
            host?.ChatMode == QuickChatModes.QuickChatOnly, game.Options.NumImpostors, game.Options.Keywords.ToString(),
            (int)game.Options.Map, (int)game.Options.Keywords);
    }

    private static PlayerDto ToPlayer(Impostor.Api.Net.IClientPlayer player)
    {
        var state = player.Character?.PlayerInfo;
        return new PlayerDto(
            player.Client.Id,
            state?.PlayerName ?? player.Client.Name,
            player.Game.Code.Code,
            player.IsHost,
            player.Game.GameState == GameStates.Started, Address(player.Client), player.Client.FriendCode,
            player.Client.GameVersion.ToString(), player.Client.PlatformSpecificData?.Platform.ToString(), player.Client.Language.ToString());
    }

    private static string? Address(Impostor.Api.Net.IClient client)
    {
        var ip = client.Connection?.EndPoint?.Address;
        return ip?.IsIPv4MappedToIPv6 == true ? ip.MapToIPv4().ToString() : ip?.ToString();
    }

    private static PlayerDto ToClient(Impostor.Api.Net.IClient client) => client.Player is { } player ? ToPlayer(player) :
        new(client.Id, client.Name, null, false, false, Address(client), client.FriendCode, client.GameVersion.ToString(),
            client.PlatformSpecificData?.Platform.ToString(), client.Language.ToString());

    public ServerInfoDto GetServerInfo() => new(RuntimeInformation.FrameworkDescription, RuntimeInformation.OSDescription,
        RuntimeInformation.ProcessArchitecture.ToString(), Environment.ProcessId, Environment.ProcessorCount,
        Assembly.GetEntryAssembly()?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
        typeof(IGame).Assembly.GetName().Version?.ToString() ?? "unknown");
}
