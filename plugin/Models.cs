namespace Finesse.Plugin;

public sealed record PlayerDto(int ClientId, string Name, string? GameCode, bool IsHost, bool InGame,
    string? Address = null, string? FriendCode = null, string? Version = null, string? Platform = null, string? Language = null);

public sealed record GameDto(
    string Code,
    string State,
    int PlayerCount,
    int MaxPlayers,
    bool IsPublic,
    string? HostName,
    IReadOnlyList<PlayerDto> Players, string? Map = null, string? Mode = null, string? Name = null,
    int? GameId = null, string? HostAddress = null, string? HostPlatform = null, bool? QuickChatOnly = null,
    int? ImpostorCount = null, string? Language = null);

public sealed record ServerInfoDto(string Runtime, string OperatingSystem, string Architecture, int ProcessId,
    int ProcessorCount, string? ServerVersion, string ApiAssemblyVersion);

public sealed record OverviewDto(
    string Status,
    long UptimeSeconds,
    int OnlinePlayers,
    int ActiveGames,
    int TotalGames,
    string PluginVersion,
    ProcessMetricsDto Process);

public sealed record SnapshotDto(
    string Status,
    long UptimeSeconds,
    int OnlinePlayers,
    int ActiveGames,
    int TotalGames,
    string PluginVersion,
    IReadOnlyList<GameDto> Games,
    IReadOnlyList<PlayerDto> Players,
    ProcessMetricsDto Process);

public sealed record ProcessMetricsDto(int ProcessId, double? CpuPercent, long WorkingSetBytes,
    long? PhysicalMemoryBytes, double? MemoryPercent, int ProcessorCount, DateTimeOffset SampledAt);

public sealed record ReportDto(DateTimeOffset Time, string GameCode, string ReporterName, string? ReporterFriendCode,
    string? ReportedName, string? ReportedFriendCode, string Reason, string Outcome);

public sealed record ReportFeedDto(bool Available, bool PersistenceAvailable, IReadOnlyList<ReportDto> Reports);

public sealed record PanelLoginDto(string Ip, string? Location, DateTimeOffset Timestamp);
