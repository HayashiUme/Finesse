namespace Finesse.Plugin;

public sealed record PlayerDto(int ClientId, string Name, string? GameCode, bool IsHost, bool InGame);

public sealed record GameDto(
    string Code,
    string State,
    int PlayerCount,
    int MaxPlayers,
    bool IsPublic,
    string? HostName,
    IReadOnlyList<PlayerDto> Players);

public sealed record OverviewDto(
    string Status,
    long UptimeSeconds,
    int OnlinePlayers,
    int ActiveGames,
    int TotalGames,
    string PluginVersion);

public sealed record SnapshotDto(
    string Status,
    long UptimeSeconds,
    int OnlinePlayers,
    int ActiveGames,
    int TotalGames,
    string PluginVersion,
    IReadOnlyList<GameDto> Games,
    IReadOnlyList<PlayerDto> Players);

public sealed record PanelLoginDto(string Ip, string? Location, DateTimeOffset Timestamp);
