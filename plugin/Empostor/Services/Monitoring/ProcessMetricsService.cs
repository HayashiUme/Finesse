using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Finesse.Plugin;

public sealed class ProcessMetricsService : IDisposable
{
    private readonly object _gate = new();
    private readonly Process _process = Process.GetCurrentProcess();
    private readonly long? _physicalMemoryBytes = ReadPhysicalMemory();
    private long _lastTimestamp = Stopwatch.GetTimestamp();
    private TimeSpan _lastCpu;
    private ProcessMetricsDto _sample;

    public ProcessMetricsService()
    {
        _lastCpu = _process.TotalProcessorTime;
        _sample = CreateSample(null);
    }

    public ProcessMetricsDto GetMetrics()
    {
        lock (_gate)
        {
            var now = Stopwatch.GetTimestamp();
            var elapsed = Stopwatch.GetElapsedTime(_lastTimestamp, now).TotalSeconds;
            // HTTP and WebSocket readers share one sample; request rate cannot distort CPU deltas.
            if (elapsed < 1) return _sample;
            _process.Refresh();
            var cpu = _process.TotalProcessorTime;
            var percent = Math.Clamp((cpu - _lastCpu).TotalSeconds / elapsed / Environment.ProcessorCount * 100, 0, 100);
            _lastCpu = cpu;
            _lastTimestamp = now;
            return _sample = CreateSample(Math.Round(percent, 2));
        }
    }

    private ProcessMetricsDto CreateSample(double? cpu)
    {
        var workingSet = _process.WorkingSet64;
        return new(Environment.ProcessId, cpu, workingSet, _physicalMemoryBytes,
            _physicalMemoryBytes is > 0 ? Math.Round((double)workingSet / _physicalMemoryBytes.Value * 100, 2) : null,
            Environment.ProcessorCount, DateTimeOffset.UtcNow);
    }

    private static long? ReadPhysicalMemory()
    {
        if (OperatingSystem.IsWindows())
        {
            var status = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
            if (GlobalMemoryStatusEx(ref status)) return (long)status.TotalPhysical;
        }
        if (OperatingSystem.IsLinux())
        {
            try
            {
                var line = File.ReadLines("/proc/meminfo").FirstOrDefault(l => l.StartsWith("MemTotal:", StringComparison.Ordinal));
                if (line?.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries) is { Length: >= 2 } parts &&
                    long.TryParse(parts[1], out var kb)) return checked(kb * 1024);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or OverflowException) { }
        }
        return null;
    }

    public void Dispose() => _process.Dispose();

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Length;
        public uint Load;
        public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile, TotalVirtual, AvailableVirtual, AvailableExtendedVirtual;
    }
}
