# Logboek van Uitgevoerde Pogingen en Resultaten (Troubleshooting Log)

Dit document houdt exact bij welke problemen zijn onderzocht, welke methoden zijn geprobeerd, wat er wel/niet werkte en wat de bewezen technische oorzaken waren.

---

## Overzicht van Onderzochte Punten

### 1. Extensie downloadknop genereert UUID / `.txt` / leeg bestand
* **Poging 1**: Downloaden via `Blob` URL met `chrome.downloads.download({ url: blobUrl, filename: '...' })`.
  * *Resultaat*: **Mislukt**. Chrome Safe Browsing kende willekeurige UUID-bestandsnamen toe (`ebee423f-...`) of hernoemde `.bat` bestanden naar `download.txt`.
* **Poging 2**: Downloaden via `data:text/plain;base64,...`.
  * *Resultaat*: **Mislukt**. Chrome dwong automatisch een `.txt` extensie af vanwege veiligheidsbeleid voor uitvoerbare bestanden.
* **Poging 3**: Direct downloaden via `chrome.runtime.getURL('helper/AnyVideoDownloaderHelper.exe?v=' + Date.now())`.
  * *Resultaat*: **Mislukt**. Chromium behandelt query-parameters (`?v=...`) als onderdeel van het fysieke bestandspad binnen de extensiemap. Hierdoor gaf Chrome intern een 404-fout en werd een leeg/corrupt HTML-foutbestand van 0 bytes gedownload.
* **Poging 4 (Huidige werkende methode)**: Direct downloaden van het zuivere pad via `chrome.runtime.getURL('helper/AnyVideoDownloaderHelper.exe')` zonder query parameters, met een directe fallback naar de GitHub raw binary URL.
  * *Resultaat*: **Succesvol**. Het volledige binaire bestand (11.038.168 bytes) wordt gedownload.

---

### 2. `.exe` Icoon Weergave in Windows Verkenner (Python/Diskette vs Groen Cirkel-icoon)
* **Poging 1**: Genereren van `.ico` via standaard Pillow `img.save(..., format='ICO')`.
  * *Resultaat*: **Mislukt in Windows Verkenner**. Pillow comprimeert sub-resoluties (16x16, 32x32, 48x48) als PNG in het `.ico`-bestand. De Windows Verkenner shell vereist voor formaten < 256x256 echter ongecomprimeerde DIB-bitmaps (`BITMAPINFOHEADER` + 32-bit BGRA). Hierdoor viel Windows terug op het standaard bootloader-icoon (de Python-diskette/slang).
* **Poging 2**: PyInstaller compilatie via `--icon "svg/icon.ico"`.
  * *Resultaat*: **Mislukt**. Het bestand `icon.ico` was verplaatst naar de map `icons/`, waardoor PyInstaller het pad niet vond en zijn eigen interne `runw.exe` icoon behield.
* **Poging 3**: `.gitignore` instelling.
  * *Resultaat*: **Ontdekte blokkade**. In `.gitignore` stond `*.exe`. Hierdoor werd het gecompileerde `.exe`-bestand lokaal wel geüpdatet, maar werd het bij `git push` nooit naar GitHub gestuurd. Dit is gecorrigeerd in commit `e9132ed`.
* **Poging 4 (Huidige werkende methode)**: Genereren van een 100% compliant Windows DIB `.ico` (137 KB) met geldige `BITMAPINFOHEADER` structuren en compilatie via een expliciet PyInstaller `.spec`-bestand dat `MAINICON` overschrijft.
  * *Resultaat*: **Succesvol in het binaire bestand**. Win32 PE resources tonen `RT_GROUP_ICON` ID 1 met alle 6 resoluties.

---

### 3. Windows SmartScreen "Onbekende Uitgever"
* **Poging 1**: Ondertekenen met Authenticode certificaat (`CN=Kenjigames`) in de `Cert:\CurrentUser\My` store.
  * *Resultaat*: **Mislukt in SmartScreen**. SmartScreen draait onder het `SYSTEM`/Local Machine context en controleert de `Trusted Root` autoriteiten. Een certificaat dat enkel in `CurrentUser\My` staat krijgt de status `UnknownError (Niet-vertrouwde basis)`.
* **Poging 2**: Toevoegen aan `CurrentUser\TrustedPublisher` via `certutil -user`.
  * *Resultaat*: **Onvoldoende voor SmartScreen**. `TrustedPublisher` zonder `Root` installatie lost `UnknownError` niet op voor SmartScreen.
* **Poging 3 (Vereist voor Windows)**: Installatie in `Cert:\LocalMachine\Root` en `Cert:\LocalMachine\TrustedPublisher`.
  * *Status*: Hiervoor is Administrator-toestemming (UAC) nodig via `install_trusted_publisher.bat`. Zonder lokale Root-registratie blokkeert Windows elk zelf-ondertekend certificaat dat via een browser binnenkomt.

---

### 4. YouTube "Alleen 360p Formaten Gevonden"
* **Oorzaak**: YouTube heeft in augustus 2026 de streaming API gewijzigd (SABR / player client challenge). De geïnstalleerde `yt-dlp` versie `2026.02.04` (februari 2026) kon geen HD-streams meer parsen en kreeg enkel de 360p legacy webstream.
* **Oplossing**: Geüpgraded via `pip install --upgrade yt-dlp` naar release **`2026.08.19`**.
* *Resultaat*: **100% Opgelost**. 4K (2160p), 1440p, 1080p, 720p en alle MP3-bitrates worden direct gedetecteerd.

---

### 5. Console Venster vs Minimalistische Dark GUI
* **Oud**: Zwart CMD commandoregelvenster.
* **Nieuw**: Volledige Tkinter dark-mode desktop GUI (`helper/app_gui.py`) met ON/OFF toggle, live downloadlog en zero console (`--windowed`).
