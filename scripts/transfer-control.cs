using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class TransferControl
{
    private const uint ProcessSuspendResume = 0x0800;

    [DllImport("ntdll.dll", SetLastError = true)]
    private static extern int NtSuspendProcess(IntPtr processHandle);

    [DllImport("ntdll.dll", SetLastError = true)]
    private static extern int NtResumeProcess(IntPtr processHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    private static int Main(string[] args)
    {
        if (args.Length != 2)
        {
            Console.Error.WriteLine("usage: transfer-control <suspend|resume> <pid>");
            return 2;
        }

        string action = args[0].Trim().ToLowerInvariant();
        if (action != "suspend" && action != "resume")
        {
            Console.Error.WriteLine("unknown action: " + action);
            return 2;
        }

        int pid;
        if (!int.TryParse(args[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out pid) || pid <= 0)
        {
            Console.Error.WriteLine("invalid pid: " + args[1]);
            return 2;
        }

        IntPtr handle = OpenProcess(ProcessSuspendResume, false, pid);
        if (handle == IntPtr.Zero)
        {
            Console.Error.WriteLine("open process failed: " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
            return 1;
        }

        try
        {
            // Make sure the PID still belongs to the process we expect.
            try
            {
                Process.GetProcessById(pid);
            }
            catch (ArgumentException)
            {
                Console.Error.WriteLine("process not found: " + pid);
                return 1;
            }

            int status = action == "suspend"
                ? NtSuspendProcess(handle)
                : NtResumeProcess(handle);

            if (status != 0)
            {
                Console.Error.WriteLine(
                    (action == "suspend" ? "suspend" : "resume") +
                    " failed: NTSTATUS 0x" + status.ToString("X8"));
                return 1;
            }

            return 0;
        }
        finally
        {
            CloseHandle(handle);
        }
    }
}
