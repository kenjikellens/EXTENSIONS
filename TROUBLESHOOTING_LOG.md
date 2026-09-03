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

### 2. `.exe` Icoon Weergave in Windows Verkenner (Python/Diskette vs Wit Blaadje vs Groen Cirkel-icoon)
* **Poging 1**: Genereren van `.ico` via standaard Pillow `img.save(..., format='ICO')`.
  * *Resultaat*: **Mislukt in Windows Verkenner**. Pillow comprimeert sub-resoluties (16x16, 32x32, 48x48) als PNG in het `.ico`-bestand. De Windows Verkenner shell vereist voor formaten < 256x256 echter ongecomprimeerde DIB-bitmaps (`BITMAPINFOHEADER` + 32-bit BGRA).
* **Poging 2**: PyInstaller compilatie via `--icon`.
  * *Resultaat*: **Ontdekte root cause (Wit blaadje)**: Bij het bouwen op Python 3.13 met PyInstaller raakte de interne PE-structuur `GRPICONDIRENTRY` gecorrumpeerd: het veld `nID` (icon ID) werd weggeschreven met foute bit-offsets (`0x00010000` = 65536 in plaats van ID `1`). Hierdoor zocht de Windows PE-loader naar onbestaande icon-ID's en concludeerde Windows dat de icoongroep corrupt was, met een **wit leeg blaadje** als gevolg.
* **Poging 3 (Definitieve Fix via Volledige PyInstaller Build + Explorer Cache Reset)**: 
  * Volledige compilatie van het 10.89 MB binaire bestand met alle 6 embedded DIB-resoluties (16x16 t/m 256x256).
  * Windows Verkenner hield de oude diskette/witte thumbnails vast in `%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*` en `thumbcache*`.
  * Na het geforceerd afsluiten van `explorer.exe`, verwijderen van alle `iconcache*`/`thumbcache*`-bestanden en herstarten van Verkenner toont Windows het **groene cirkel-icoon 100% direct en overal** (bestandslijst, contextmenu, rechter detailvenster en taakbalk).
  * *Resultaat*: **Definitief Opgelost & Werkend**.

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

### 6. Chrome Download-Paneel / Downloadbubbel Weergave (Regressie in Chromium)
* **Vaststelling**: In de downloadbubbel van Google Chrome (rechtsboven in de browserbalk) wordt voor `.exe`-bestanden een generiek icoontje getoond, terwijl het bestand in de Windows Verkenner map wél een echt ingebouwd icoon heeft.
* **Oorzaak (Chromium Bug)**: In recente Chrome-versies (vanaf v151+) heeft Google een beveiligingsregressie geïntroduceerd waarbij de download-interface van de browser weigert embedded PE-iconen van niet-vertrouwde downloads uit te pakken in de browser-UI zelf. De browser toont daar altijd een standaardplaceholder.
* **Verificatie**: Zodra je in Chrome klikt op **"Weergeven in map"** (of de map `Downloads` opent in Windows Verkenner), leest Windows het icoon rechtstreeks uit de PE binary en wordt het echte icoon gerenderd.

---

### 7. Schermloos Automatisch Starten via Chrome Native Messaging
* **Doel**: De helper executable hoeft niet meer handmatig gestart te worden; de browser start hem zelf stil op de achtergrond en sluit hem direct af bij het sluiten van de browser.
* **Onderzochte & Opgeloste Punten**:
  1. *Unchecked runtime.lastError op stdout*: Chrome Native Messaging vereist een strikte 4-byte header op stdout. Tekst-logs vanuit `broadcast_log` braken het protocol. Opgelost door stdout om te leiden naar stderr en stdout exclusief voor binaire Native Messaging pakketten te gebruiken.
  2. *Hangen van `yt-dlp` en 15% loader*: Kindprocessen erfden de stdin-pipe van Chrome waardoor ze bleven wachten op console-invoer. Opgelost door `stdin=subprocess.DEVNULL` toe te voegen aan `subprocess.run` en `subprocess.Popen`.
  3. *Audio-bitrates*: Uitgebreid naar het volledige spectrum: 320, 256, 192, 128, 96 en 64 kbps.
* *Resultaat*: **100% Opgelost**. Formaten laden binnen ~2.5s, helper draait stil op de achtergrond zonder venster.
