using System.Diagnostics;
using Impostor.Api.Games;
using Impostor.Api.Games.Managers;
using Impostor.Api.Innersloth;
using Impostor.Api.Net.Manager;

namespace Finesse.Plugin;

public sealed class SnapshotService
{
    private readonly IGameManager _gameManager;
    private readonly IClientManager _clientManager;
    private readonly Stopwatch _uptime = Stopwatch.StartNew();

    public SnapshotService(IGameManager gameManager, IClientManager clientManager)
    {
        _gameManager = gameManager;
        _clientManager = clientManager;
    }

    public SnapshotDto GetSnapshot()
    {
        var games = _gameManager.Games.Select(ToGame).ToArray();
        var players = _clientManager.Clients
            .Select(client => client.Player is { } player ? ToPlayer(player) : new PlayerDto(client.Id, client.Name, null, false, false))
            .ToArray();
        var activeGames = games.Count(game => game.State == nameof(GameStates.Started));

        return new SnapshotDto("online", (long)_uptime.Elapsed.TotalSeconds, players.Length, activeGames, games.Length, "0.1.0", games, players);
    }

    private static GameDto ToGame(IGame game)
    {
        var players = game.Players.Select(ToPlayer).ToArray();
        return new GameDto(
            game.Code.Code,
            game.GameState.ToString(),
            game.PlayerCount,
            game.Options.MaxPlayers,
            game.IsPublic,
            game.Host?.Client.Name,
            players);
    }

    private static PlayerDto ToPlayer(Impostor.Api.Net.IClientPlayer player)
    {
        var state = player.Character?.PlayerInfo;
        return new PlayerDto(
            player.Client.Id,
            state?.PlayerName ?? player.Client.Name,
            player.Game.Code.Code,
            player.IsHost,
            player.Game.GameState == GameStates.Started);
    }
}
