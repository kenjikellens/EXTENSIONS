<#
.SYNOPSIS
    set_exe_icon.ps1 - Native Win32 Resource Injector for Windows PE Executables.
    Uses kernel32!BeginUpdateResourceW to physically inject icon.ico into the PE binary.
#>

param(
    [string]$ExePath = "any video downloader\helper\AnyVideoDownloaderHelper.exe",
    [string]$IcoPath = "any video downloader\icons\icon.ico"
)

$source = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class NativeIconInjector
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool UpdateResource(
        IntPtr hUpdate,
        IntPtr lpType,
        IntPtr lpName,
        ushort wLanguage,
        byte[] lpData,
        uint cbData);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);

    private const int RT_ICON = 3;
    private const int RT_GROUP_ICON = 14;

    public static bool Inject(string exePath, string icoPath)
    {
        byte[] icoBytes = File.ReadAllBytes(icoPath);
        if (icoBytes.Length < 6) return false;

        ushort reserved = BitConverter.ToUInt16(icoBytes, 0);
        ushort type = BitConverter.ToUInt16(icoBytes, 2);
        ushort count = BitConverter.ToUInt16(icoBytes, 4);

        if (type != 1 || count == 0) return false;

        IntPtr hUpdate = BeginUpdateResource(exePath, false);
        if (hUpdate == IntPtr.Zero)
        {
            Console.WriteLine("BeginUpdateResource failed: " + Marshal.GetLastWin32Error());
            return false;
        }

        // Build GRPICONDIR structure (6 bytes header + count * 14 bytes)
        int grpSize = 6 + count * 14;
        byte[] grpBytes = new byte[grpSize];
        Array.Copy(icoBytes, 0, grpBytes, 0, 6);

        for (int i = 0; i < count; i++)
        {
            int dirOffset = 6 + i * 16;
            byte width = icoBytes[dirOffset + 0];
            byte height = icoBytes[dirOffset + 1];
            byte colorCount = icoBytes[dirOffset + 2];
            byte reservedByte = icoBytes[dirOffset + 3];
            ushort planes = BitConverter.ToUInt16(icoBytes, dirOffset + 4);
            ushort bitCount = BitConverter.ToUInt16(icoBytes, dirOffset + 6);
            uint bytesInRes = BitConverter.ToUInt32(icoBytes, dirOffset + 8);
            uint imageOffset = BitConverter.ToUInt32(icoBytes, dirOffset + 12);

            ushort iconId = (ushort)(i + 1);

            // Extract the raw image payload
            byte[] iconData = new byte[bytesInRes];
            Array.Copy(icoBytes, (int)imageOffset, iconData, 0, (int)bytesInRes);

            // Inject RT_ICON
            bool okIcon = UpdateResource(
                hUpdate,
                (IntPtr)RT_ICON,
                (IntPtr)iconId,
                0, // Neutral language
                iconData,
                bytesInRes);

            if (!okIcon)
            {
                Console.WriteLine("UpdateResource RT_ICON failed for ID " + iconId);
            }

            // Write GRPICONDIRENTRY (14 bytes)
            int grpEntryOffset = 6 + i * 14;
            grpBytes[grpEntryOffset + 0] = width;
            grpBytes[grpEntryOffset + 1] = height;
            grpBytes[grpEntryOffset + 2] = colorCount;
            grpBytes[grpEntryOffset + 3] = reservedByte;
            Array.Copy(BitConverter.GetBytes(planes), 0, grpBytes, grpEntryOffset + 4, 2);
            Array.Copy(BitConverter.GetBytes(bitCount), 0, grpBytes, grpEntryOffset + 6, 2);
            Array.Copy(BitConverter.GetBytes(bytesInRes), 0, grpBytes, grpEntryOffset + 8, 4);
            Array.Copy(BitConverter.GetBytes(iconId), 0, grpBytes, grpEntryOffset + 12, 2);
        }

        // Inject RT_GROUP_ICON as Resource ID 1 (Standard Windows Main Icon)
        bool okGroup1 = UpdateResource(
            hUpdate,
            (IntPtr)RT_GROUP_ICON,
            (IntPtr)1,
            0,
            grpBytes,
            (uint)grpSize);

        // Also inject as string "MAINICON" (PyInstaller compatibility)
        IntPtr pMainIcon = Marshal.StringToHGlobalUni("MAINICON");
        bool okGroupMain = UpdateResource(
            hUpdate,
            (IntPtr)RT_GROUP_ICON,
            pMainIcon,
            0,
            grpBytes,
            (uint)grpSize);
        Marshal.FreeHGlobal(pMainIcon);

        bool success = EndUpdateResource(hUpdate, false);
        return success;
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp

$fullExe = (Resolve-Path $ExePath).Path
$fullIco = (Resolve-Path $IcoPath).Path

Write-Host "Injecting $fullIco into $fullExe via native Win32 API..."
$res = [NativeIconInjector]::Inject($fullExe, $fullIco)
if ($res) {
    Write-Host "[SUCCESS] Native Win32 icon injection complete!" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Icon injection failed." -ForegroundColor Red
}
