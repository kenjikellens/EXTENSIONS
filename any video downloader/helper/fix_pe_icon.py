"""
fix_pe_icon.py - Fixes corrupted GRPICONDIRENTRY headers in PyInstaller PE executables.
Ensures nID in RT_GROUP_ICON matches RT_ICON entries (1, 2, 3, 4, 5, 6) with perfect 14-byte alignment.
"""

import struct
import pefile

def fix_icon_group(exe_path):
    with open(exe_path, 'rb') as f:
        exe_bytes = bytearray(f.read())

    pe = pefile.PE(data=exe_bytes)

    # Locate RT_GROUP_ICON (14)
    for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        if entry.id == 14:
            for sub in entry.directory.entries:
                data_rva = sub.directory.entries[0].data.struct.OffsetToData
                size = sub.directory.entries[0].data.struct.Size
                file_offset = pe.get_offset_from_rva(data_rva)

                raw = exe_bytes[file_offset:file_offset+size]
                rsvd, typ, count = struct.unpack('<HHH', raw[:6])
                print(f"Fixing Group Icon at file offset {file_offset}: count={count}")

                # Reconstruct valid GRPICONDIR + GRPICONDIRENTRY entries
                new_grp_data = bytearray(struct.pack('<HHH', 0, 1, count))

                for i in range(count):
                    # In ICO file, entry is 14 bytes:
                    # BYTE bWidth, BYTE bHeight, BYTE bColorCount, BYTE bReserved
                    # WORD wPlanes, WORD wBitCount
                    # DWORD dwBytesInRes
                    # WORD nID (1-indexed ID matching RT_ICON)
                    w, h, colors, rsvd2, planes, bpp = struct.unpack_from('<BBBBHH', raw, 6 + i*14)
                    
                    # Extract the icon size from the RT_ICON resource
                    icon_entry = pe.DIRECTORY_ENTRY_RESOURCE.entries[0] # RT_ICON (3)
                    rt_icon_entry = [e for e in pe.DIRECTORY_ENTRY_RESOURCE.entries if e.id == 3][0]
                    icon_res = rt_icon_entry.directory.entries[i]
                    bytes_in_res = icon_res.directory.entries[0].data.struct.Size
                    icon_id = icon_res.id # Exact integer ID: 1, 2, 3, 4, 5, 6

                    fixed_entry = struct.pack('<BBBBHHIH',
                        w, h, colors, rsvd2,
                        planes, bpp,
                        bytes_in_res,
                        icon_id
                    )
                    new_grp_data.extend(fixed_entry)
                    print(f"  Fixed Entry {i}: {w or 256}x{h or 256}, size={bytes_in_res}, nID={icon_id}")

                # Write fixed group data back into the executable buffer
                exe_bytes[file_offset:file_offset+len(new_grp_data)] = new_grp_data

    # Save fixed binary
    with open(exe_path, 'wb') as f:
        f.write(exe_bytes)

    print("Successfully patched PE icon group structure!")

if __name__ == '__main__':
    fix_icon_group('any video downloader/helper/AnyVideoDownloaderHelper.exe')
