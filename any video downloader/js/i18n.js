/**
 * @file i18n.js
 * @description Internationalization module for Any Video Downloader extension.
 * Supports: nl (Nederlands), en (English), de (Deutsch), fr (Français), es (Español).
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'nl', name: 'Nederlands' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
];

export const TRANSLATIONS = {
  nl: {
    refresh_title: 'Server status controleren / herladen',
    theme_title: 'Thema wisselen (Light/Dark)',
    clear_title: 'Lijst wissen',
    settings_title: 'Instellingen',
    settings_header: 'Instellingen',
    settings_language: 'Taal / Language',
    settings_close: 'Sluiten',
    helper_active: '● Helper Actief',
    helper_offline: '○ Helper Offline',
    video_loading: 'Video laden...',
    banner_title: 'YouTube Helper Vereist',
    banner_desc: 'YouTube splitst audio en video. Koppel eenmalig de helper om 1080p, 4K en MP3 direct in de browser te ontgrendelen:',
    download_helper_btn: 'Download Helper (.exe)',
    check_helper_btn: 'Opnieuw Controleren',
    banner_steps: 'Start install_helper.bat of open de .exe en klik op \'Koppel aan Browser\'',
    tab_video: 'Video',
    tab_audio: 'Audio',
    tab_subtitles: 'Ondertitels',
    empty_title: 'Geen video streams gedetecteerd',
    empty_subtitle: 'Speel een video af op de pagina of plak hierboven handmatig een URL.',
    empty_video: 'Geen videokwaliteiten gedetecteerd.',
    empty_audio: 'Geen audiotracks gedetecteerd.',
    empty_subtitles: 'Geen ondertitels beschikbaar voor deze video.',
    fetching: 'Fetching...',
    manual_placeholder: 'Plak video / .m3u8 URL...',
    filter_placeholder: 'Filter streams op naam of type...',
    download: 'Download',
    copy: 'Kopieer',
    cancel: 'Annuleren',
    downloading: 'Downloaden...',
    copied_toast: 'URL gekopieerd!',
    download_started: 'Download gestart in achtergrond!',
    download_completed: 'Download voltooid!',
    download_cancelled: 'Download geannuleerd.',
    helper_downloaded: 'AnyVideoDownloaderHelper.exe gedownload!',
    helper_download_failed: 'Kon helper bestand niet downloaden.',
    list_cleared: 'Lijst gewist.',
  },
  en: {
    refresh_title: 'Check server status / reload',
    theme_title: 'Toggle theme (Light/Dark)',
    clear_title: 'Clear list',
    settings_title: 'Settings',
    settings_header: 'Settings',
    settings_language: 'Language',
    settings_close: 'Close',
    helper_active: '● Helper Active',
    helper_offline: '○ Helper Offline',
    video_loading: 'Loading video...',
    banner_title: 'YouTube Helper Required',
    banner_desc: 'YouTube splits audio and video. Connect the helper once to unlock 1080p, 4K, and MP3 right in the browser:',
    download_helper_btn: 'Download Helper (.exe)',
    check_helper_btn: 'Check Again',
    banner_steps: 'Run install_helper.bat or open the .exe and click \'Link to Browser\'',
    tab_video: 'Video',
    tab_audio: 'Audio',
    tab_subtitles: 'Subtitles',
    empty_title: 'No video streams detected',
    empty_subtitle: 'Play a video on the page or paste a URL manually above.',
    empty_video: 'No video qualities detected.',
    empty_audio: 'No audio tracks detected.',
    empty_subtitles: 'No subtitles available for this video.',
    fetching: 'Fetching...',
    manual_placeholder: 'Paste video / .m3u8 URL...',
    filter_placeholder: 'Filter streams by name or type...',
    download: 'Download',
    copy: 'Copy',
    cancel: 'Cancel',
    downloading: 'Downloading...',
    copied_toast: 'URL copied!',
    download_started: 'Download started in background!',
    download_completed: 'Download completed!',
    download_cancelled: 'Download cancelled.',
    helper_downloaded: 'AnyVideoDownloaderHelper.exe downloaded!',
    helper_download_failed: 'Could not download helper binary.',
    list_cleared: 'List cleared.',
  },
  de: {
    refresh_title: 'Serverstatus prüfen / neu laden',
    theme_title: 'Design wechseln (Hell/Dunkel)',
    clear_title: 'Liste leeren',
    settings_title: 'Einstellungen',
    settings_header: 'Einstellungen',
    settings_language: 'Sprache / Language',
    settings_close: 'Schließen',
    helper_active: '● Helper Aktiv',
    helper_offline: '○ Helper Offline',
    video_loading: 'Video wird geladen...',
    banner_title: 'YouTube-Helper Erforderlich',
    banner_desc: 'YouTube trennt Audio und Video. Verbinden Sie den Helper einmalig, um 1080p, 4K und MP3 direkt im Browser freizuschalten:',
    download_helper_btn: 'Helper Herunterladen (.exe)',
    check_helper_btn: 'Erneut Prüfen',
    banner_steps: 'Starte install_helper.bat oder öffne die .exe und klicke auf \'Mit Browser verknüpfen\'',
    tab_video: 'Video',
    tab_audio: 'Audio',
    tab_subtitles: 'Untertitel',
    empty_title: 'Keine Videostreams erkannt',
    empty_subtitle: 'Spiele ein Video auf der Seite ab oder füge oben manuell eine URL ein.',
    empty_video: 'Keine Videoqualitäten erkannt.',
    empty_audio: 'Keine Audiotracks erkannt.',
    empty_subtitles: 'Keine Untertitel für dieses Video verfügbar.',
    fetching: 'Wird geladen...',
    manual_placeholder: 'Video / .m3u8 URL einfügen...',
    filter_placeholder: 'Streams nach Name oder Typ filtern...',
    download: 'Herunterladen',
    copy: 'Kopieren',
    cancel: 'Abbrechen',
    downloading: 'Wird heruntergeladen...',
    copied_toast: 'URL kopiert!',
    download_started: 'Download im Hintergrund gestartet!',
    download_completed: 'Download abgeschlossen!',
    download_cancelled: 'Download abgebrochen.',
    helper_downloaded: 'AnyVideoDownloaderHelper.exe heruntergeladen!',
    helper_download_failed: 'Helper-Datei konnte nicht heruntergeladen werden.',
    list_cleared: 'Liste geleert.',
  },
  fr: {
    refresh_title: 'Vérifier l\'état du serveur / actualiser',
    theme_title: 'Changer de thème (Clair/Sombre)',
    clear_title: 'Effacer la liste',
    settings_title: 'Paramètres',
    settings_header: 'Paramètres',
    settings_language: 'Langue / Language',
    settings_close: 'Fermer',
    helper_active: '● Helper Actif',
    helper_offline: '○ Helper Hors ligne',
    video_loading: 'Chargement vidéo...',
    banner_title: 'Helper YouTube Requis',
    banner_desc: 'YouTube sépare l\'audio et la vidéo. Connectez le helper une fois pour débloquer 1080p, 4K et MP3 dans le navigateur:',
    download_helper_btn: 'Télécharger le Helper (.exe)',
    check_helper_btn: 'Revérifier',
    banner_steps: 'Lancez install_helper.bat ou ouvrez le .exe et cliquez sur \'Lier au Navigateur\'',
    tab_video: 'Vidéo',
    tab_audio: 'Audio',
    tab_subtitles: 'Sous-titres',
    empty_title: 'Aucun flux vidéo détecté',
    empty_subtitle: 'Lancez une vidéo sur la page ou collez une URL ci-dessus.',
    empty_video: 'Aucune qualité vidéo détectée.',
    empty_audio: 'Aucune piste audio détectée.',
    empty_subtitles: 'Aucun sous-titre disponible pour cette vidéo.',
    fetching: 'Récupération...',
    manual_placeholder: 'Coller l\'URL vidéo / .m3u8...',
    filter_placeholder: 'Filtrer les flux par nom ou type...',
    download: 'Télécharger',
    copy: 'Copier',
    cancel: 'Annuler',
    downloading: 'Téléchargement...',
    copied_toast: 'URL copiée!',
    download_started: 'Téléchargement lancé en arrière-plan!',
    download_completed: 'Téléchargement terminé!',
    download_cancelled: 'Téléchargement annulé.',
    helper_downloaded: 'AnyVideoDownloaderHelper.exe téléchargé!',
    helper_download_failed: 'Impossible de télécharger le fichier helper.',
    list_cleared: 'Liste effacée.',
  },
  es: {
    refresh_title: 'Verificar estado del servidor / recargar',
    theme_title: 'Cambiar tema (Claro/Oscuro)',
    clear_title: 'Limpiar lista',
    settings_title: 'Configuración',
    settings_header: 'Configuración',
    settings_language: 'Idioma / Language',
    settings_close: 'Cerrar',
    helper_active: '● Helper Activo',
    helper_offline: '○ Helper Desconectado',
    video_loading: 'Cargando video...',
    banner_title: 'Se Requiere Helper YouTube',
    banner_desc: 'YouTube separa audio y video. Conecta el helper una sola vez para desbloquear 1080p, 4K y MP3 en el navegador:',
    download_helper_btn: 'Descargar Helper (.exe)',
    check_helper_btn: 'Verificar de Nuevo',
    banner_steps: 'Ejecuta install_helper.bat o abre el .exe y haz clic en \'Vincular al Navegador\'',
    tab_video: 'Video',
    tab_audio: 'Audio',
    tab_subtitles: 'Subtítulos',
    empty_title: 'No se detectaron secuencias de video',
    empty_subtitle: 'Reproduce un video en la página o pega una URL arriba.',
    empty_video: 'No se detectaron calidades de video.',
    empty_audio: 'No se detectaron pistas de audio.',
    empty_subtitles: 'No hay subtítulos disponibles para este video.',
    fetching: 'Obteniendo...',
    manual_placeholder: 'Pegar URL de video / .m3u8...',
    filter_placeholder: 'Filtrar secuencias por nombre o tipo...',
    download: 'Descargar',
    copy: 'Copiar',
    cancel: 'Cancelar',
    downloading: 'Descargando...',
    copied_toast: '¡URL copiada!',
    download_started: '¡Descarga iniciada en segundo plano!',
    download_completed: '¡Descarga completada!',
    download_cancelled: 'Descarga cancelada.',
    helper_downloaded: '¡AnyVideoDownloaderHelper.exe descargado!',
    helper_download_failed: 'No se pudo descargar el archivo helper.',
    list_cleared: 'Lista limpiada.',
  },
};

/**
 * Gets translation string by key and language code.
 * @param {string} key - Translation dictionary key
 * @param {string} [lang='nl'] - Active language code
 * @returns {string}
 */
export function t(key, lang = 'nl') {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.nl;
  return dict[key] || TRANSLATIONS.nl[key] || key;
}

/**
 * Translates all DOM elements containing data-i18n attributes.
 * @param {string} lang - Active language code
 */
export function applyI18n(lang = 'nl') {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key, lang);
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.setAttribute('title', t(key, lang));
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.setAttribute('placeholder', t(key, lang));
    }
  });
}
