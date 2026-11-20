using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Finesse.Plugin;

public sealed record AuthUser(string Id, string Username, string Role, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? Avatar);
public sealed record AuthSession(string Token, DateTimeOffset ExpiresAt, AuthUser User);
public sealed record AuthChallenge(string Id, string Prompt);
public sealed record AuthLoginResult(int Status, string? Error, AuthSession? Session, AuthChallenge? Challenge, int RetryAfterSeconds = 0);
public sealed record ManagedUser(string Id, string Username, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? Avatar);

public sealed class AuthenticationService
{
    private const int PasswordIterations = 310_000;
    private const int FailureLimit = 5;
    private static readonly TimeSpan FailureWindow = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(8);
    private static readonly Regex UsernamePattern = new("^[A-Za-z0-9_.-]{3,32}$", RegexOptions.CultureInvariant);
    private readonly object _gate = new();
    private readonly string _storePath;
    private readonly string _apiKey;
    private readonly Dictionary<string, SessionState> _sessions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, FailureState> _failures = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, FailureState> _accountFailures = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ChallengeState> _challenges = new(StringComparer.Ordinal);
    private UserStore _store;

    public AuthenticationService(FinesseOptions options, string? storePath = null)
    {
        _apiKey = options.ApiKey;
        _storePath = storePath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "finesse-users.json");
        _store = LoadStore(_storePath);
    }

    public AuthLoginResult LoginSuperAdmin(string? apiKey, string ip, string? challengeId, string? challengeAnswer)
    {
        lock (_gate)
        {
            if (TryGetLoginLockout(ip, "superadmin", out var wait)) return new(429, "lockedOut", null, null, wait);
            if (RequiresCaptcha(ip) && !ConsumeChallenge(ip, challengeId, challengeAnswer))
                return Failed(ip, "captchaInvalid");
            if (!FixedTimeEquals(apiKey, _apiKey)) return Failed(ip, "invalidCredentials", "superadmin");
            return Succeed(ip, new("superadmin", "superadmin", "superadmin", _store.SuperAdminAvatar), "superadmin");
        }
    }

    public AuthLoginResult LoginAdmin(string? username, string? password, string ip, string? challengeId, string? challengeAnswer)
    {
        lock (_gate)
        {
            var normalized = username?.Trim() ?? string.Empty;
            var accountKey = "admin:" + normalized;
            if (TryGetLoginLockout(ip, accountKey, out var wait)) return new(429, "lockedOut", null, null, wait);
            if (RequiresCaptcha(ip) && !ConsumeChallenge(ip, challengeId, challengeAnswer))
                return Failed(ip, "captchaInvalid");

            var user = _store.Users.FirstOrDefault(candidate => candidate.Username.Equals(normalized, StringComparison.OrdinalIgnoreCase));
            var salt = user is null ? new byte[16] : Convert.FromBase64String(user.Salt);
            var expected = user is null ? new byte[32] : Convert.FromBase64String(user.PasswordHash);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password ?? string.Empty, salt, PasswordIterations, HashAlgorithmName.SHA256, 32);
            if (user is null || !CryptographicOperations.FixedTimeEquals(actual, expected))
                return Failed(ip, "invalidCredentials", accountKey);

            return Succeed(ip, new(user.Id, user.Username, "admin", user.Avatar), accountKey);
        }
    }

    public AuthUser? Authenticate(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        lock (_gate)
        {
            if (!_sessions.TryGetValue(token, out var session)) return null;
            if (session.ExpiresAt <= DateTimeOffset.UtcNow)
            {
                _sessions.Remove(token);
                return null;
            }
            return session.User;
        }
    }

    public void Logout(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        lock (_gate) _sessions.Remove(token);
    }

    public ManagedUser[] GetUsers()
    {
        lock (_gate) return _store.Users.Select(user => new ManagedUser(user.Id, user.Username, user.Avatar)).ToArray();
    }

    public ManagedUser CreateUser(string? username, string? password, string? avatar)
    {
        var name = username?.Trim() ?? string.Empty;
        if (!UsernamePattern.IsMatch(name)) throw new ManagementException(400, "usernameInvalid");
        if (string.IsNullOrEmpty(password) || password.Length < 12 || password.Length > 256)
            throw new ManagementException(400, "passwordPolicy");
        ValidateAvatar(avatar);

        lock (_gate)
        {
            if (_store.Users.Count >= 100) throw new ManagementException(409, "userLimitReached");
            if (name.Equals("superadmin", StringComparison.OrdinalIgnoreCase) || _store.Users.Any(user => user.Username.Equals(name, StringComparison.OrdinalIgnoreCase)))
                throw new ManagementException(409, "usernameTaken");

            var salt = RandomNumberGenerator.GetBytes(16);
            var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, PasswordIterations, HashAlgorithmName.SHA256, 32);
            var user = new StoredUser(Guid.NewGuid().ToString("N"), name, Convert.ToBase64String(salt), Convert.ToBase64String(hash), avatar);
            SaveStore(new UserStore { Users = [.. _store.Users, user], SuperAdminAvatar = _store.SuperAdminAvatar });
            return new ManagedUser(user.Id, user.Username, user.Avatar);
        }
    }

    public void DeleteUser(string id)
    {
        lock (_gate)
        {
            var user = _store.Users.FirstOrDefault(candidate => candidate.Id == id)
                ?? throw new ManagementException(404, "userNotFound");
            SaveStore(new UserStore { Users = _store.Users.Where(candidate => candidate.Id != id).ToList(), SuperAdminAvatar = _store.SuperAdminAvatar });
            foreach (var token in _sessions.Where(pair => pair.Value.User.Id == id).Select(pair => pair.Key).ToArray())
                _sessions.Remove(token);
        }
    }

    public AuthUser UpdateAvatar(AuthUser current, string? avatar)
    {
        ValidateAvatar(avatar);
        lock (_gate)
        {
            if (current.Role == "superadmin")
            {
                SaveStore(new UserStore { Users = _store.Users, SuperAdminAvatar = avatar });
                current = current with { Avatar = avatar };
            }
            else
            {
                var user = _store.Users.FirstOrDefault(candidate => candidate.Id == current.Id)
                    ?? throw new ManagementException(401, "sessionExpired");
                var updated = new StoredUser(user.Id, user.Username, user.Salt, user.PasswordHash, avatar);
                SaveStore(new UserStore { Users = _store.Users.Select(candidate => candidate.Id == current.Id ? updated : candidate).ToList(), SuperAdminAvatar = _store.SuperAdminAvatar });
                current = current with { Avatar = avatar };
            }

            foreach (var token in _sessions.Where(pair => pair.Value.User.Id == current.Id).Select(pair => pair.Key).ToArray())
                _sessions[token] = _sessions[token] with { User = current };
            return current;
        }
    }

    private AuthLoginResult Succeed(string ip, AuthUser user, string accountKey)
    {
        _failures.Remove(ip);
        _accountFailures.Remove(accountKey);
        RemoveChallenges(ip);
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var expires = DateTimeOffset.UtcNow.Add(SessionLifetime);
        var session = new AuthSession(token, expires, user);
        _sessions[token] = new SessionState(expires, user);
        return new(200, null, session, null);
    }

    private AuthLoginResult Failed(string ip, string error, string? accountKey = null)
    {
        var ipWait = RecordFailure(_failures, ip);
        var accountWait = accountKey is null ? 0 : RecordFailure(_accountFailures, accountKey);
        var wait = Math.Max(ipWait, accountWait);
        if (wait > 0)
        {
            RemoveChallenges(ip);
            return new(429, "lockedOut", null, null, wait);
        }
        return new(401, error, null, CreateChallenge(ip));
    }

    private static int RecordFailure(Dictionary<string, FailureState> failures, string key)
    {
        var now = DateTimeOffset.UtcNow;
        if (!failures.TryGetValue(key, out var failure) || now - failure.StartedAt >= FailureWindow)
            failure = new FailureState(0, now, null);
        failure = failure with { Count = failure.Count + 1 };
        if (failure.Count >= FailureLimit)
        {
            failure = failure with { LockedUntil = now.Add(FailureWindow) };
            failures[key] = failure;
            return (int)FailureWindow.TotalSeconds;
        }

        failures[key] = failure;
        return 0;
    }

    private bool RequiresCaptcha(string ip) => _failures.TryGetValue(ip, out var failure) && failure.Count > 0;

    private bool TryGetLoginLockout(string ip, string accountKey, out int wait)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var failures in new[] { _failures, _accountFailures })
            foreach (var key in failures.Where(pair => now - pair.Value.StartedAt >= FailureWindow &&
                         (pair.Value.LockedUntil is null || pair.Value.LockedUntil <= now)).Select(pair => pair.Key).ToArray())
                failures.Remove(key);
        foreach (var id in _challenges.Where(pair => pair.Value.ExpiresAt <= now).Select(pair => pair.Key).ToArray())
            _challenges.Remove(id);
        var ipLocked = TryGetLockout(_failures, ip, out var ipWait);
        var accountLocked = TryGetLockout(_accountFailures, accountKey, out var accountWait);
        wait = Math.Max(ipWait, accountWait);
        return ipLocked || accountLocked;
    }

    private static bool TryGetLockout(Dictionary<string, FailureState> failures, string key, out int wait)
    {
        wait = 0;
        if (!failures.TryGetValue(key, out var failure)) return false;
        if (failure.LockedUntil is { } until && until > DateTimeOffset.UtcNow)
        {
            wait = Math.Max(1, (int)Math.Ceiling((until - DateTimeOffset.UtcNow).TotalSeconds));
            return true;
        }
        if (DateTimeOffset.UtcNow - failure.StartedAt >= FailureWindow) failures.Remove(key);
        return false;
    }

    private AuthChallenge CreateChallenge(string ip)
    {
        RemoveChallenges(ip);
        var left = RandomNumberGenerator.GetInt32(2, 10);
        var right = RandomNumberGenerator.GetInt32(1, 10);
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        _challenges[id] = new ChallengeState(ip, (left + right).ToString(), DateTimeOffset.UtcNow.AddMinutes(3));
        return new AuthChallenge(id, $"{left} + {right} = ?");
    }

    private bool ConsumeChallenge(string ip, string? id, string? answer)
    {
        if (string.IsNullOrWhiteSpace(id) || !_challenges.Remove(id, out var challenge)) return false;
        return challenge.ExpiresAt > DateTimeOffset.UtcNow && challenge.Ip.Equals(ip, StringComparison.OrdinalIgnoreCase) &&
            FixedTimeEquals(answer?.Trim(), challenge.Answer);
    }

    private void RemoveChallenges(string ip)
    {
        foreach (var id in _challenges.Where(pair => pair.Value.Ip.Equals(ip, StringComparison.OrdinalIgnoreCase)).Select(pair => pair.Key).ToArray())
            _challenges.Remove(id);
    }

    private static bool FixedTimeEquals(string? left, string right)
    {
        var bytes = Encoding.UTF8.GetBytes(left ?? string.Empty);
        var expected = Encoding.UTF8.GetBytes(right);
        return bytes.Length == expected.Length && CryptographicOperations.FixedTimeEquals(bytes, expected);
    }

    private static void ValidateAvatar(string? avatar)
    {
        if (avatar is null) return;
        const string png = "data:image/png;base64,";
        const string jpeg = "data:image/jpeg;base64,";
        const string webp = "data:image/webp;base64,";
        var prefix = avatar.StartsWith(png, StringComparison.Ordinal) ? png :
            avatar.StartsWith(jpeg, StringComparison.Ordinal) ? jpeg :
            avatar.StartsWith(webp, StringComparison.Ordinal) ? webp : null;
        if (prefix is null || avatar.Length > 360_000) throw new ManagementException(400, "avatarInvalid");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(avatar[prefix.Length..]); }
        catch (FormatException) { throw new ManagementException(400, "avatarInvalid"); }
        if (bytes.Length is 0 or > 256_000) throw new ManagementException(400, "avatarInvalid");
        var valid = prefix == png
            ? bytes.Length >= 24 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) &&
                Encoding.ASCII.GetString(bytes, 12, 4) == "IHDR" &&
                System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4)) > 0 &&
                System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4)) > 0
            : prefix == jpeg
                ? bytes.Length >= 4 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff && bytes[^2] == 0xff && bytes[^1] == 0xd9
                : bytes.Length >= 12 && Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP";
        if (!valid) throw new ManagementException(400, "avatarInvalid");
    }

    private static UserStore LoadStore(string path)
    {
        if (!File.Exists(path)) return new UserStore();
        try { return JsonSerializer.Deserialize<UserStore>(File.ReadAllText(path), JsonDefaults.Options) ?? new UserStore(); }
        catch (JsonException ex) { throw new InvalidOperationException($"Cannot read Finesse account store '{path}': invalid JSON.", ex); }
    }

    private void SaveStore(UserStore next)
    {
        var temp = _storePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(next, new JsonSerializerOptions(JsonDefaults.Options) { WriteIndented = true }));
            File.Move(temp, _storePath, true);
            _store = next;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new ManagementException(500, "accountStoreUnavailable");
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    private sealed record SessionState(DateTimeOffset ExpiresAt, AuthUser User);
    private sealed record FailureState(int Count, DateTimeOffset StartedAt, DateTimeOffset? LockedUntil);
    private sealed record ChallengeState(string Ip, string Answer, DateTimeOffset ExpiresAt);
    private sealed class UserStore
    {
        public List<StoredUser> Users { get; set; } = [];
        public string? SuperAdminAvatar { get; set; }
    }
    private sealed class StoredUser(string id, string username, string salt, string passwordHash, string? avatar)
    {
        public string Id { get; set; } = id;
        public string Username { get; set; } = username;
        public string Salt { get; set; } = salt;
        public string PasswordHash { get; set; } = passwordHash;
        public string? Avatar { get; set; } = avatar;
    }
}
