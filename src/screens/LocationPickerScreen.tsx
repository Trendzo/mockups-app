import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Geolocation from '@react-native-community/geolocation';

// Prefer the Play-Services fused provider ('auto' falls back to LocationManager
// only when Play Services is absent). Without this the library uses the legacy
// Android LocationManager, which — with enableHighAccuracy — waits on a raw GPS
// fix and times out indoors/on emulators, so the button just errors after 15s.
// skipPermissionRequests: we request the Android runtime permission ourselves.
Geolocation.setRNConfiguration({
  skipPermissionRequests: true,
  authorizationLevel: 'whenInUse',
  locationProvider: 'auto',
});

/** One getCurrentPosition call wrapped in a promise. maximumAge accepts a recent
 *  cached fix so a warm provider returns near-instantly instead of waiting for a
 *  fresh satellite/network lock. */
function getPosition(enableHighAccuracy: boolean, timeout: number) {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy, timeout, maximumAge: 60000 },
    );
  });
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BackButton,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { GeoPlace, reverseGeocode, searchPlaces } from '../api/geocode';
import { useApplicationDraft } from '../store/applicationDraft';
import { gstStateCode } from '../utils/gstStates';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

// Leaflet + OpenStreetMap map. A fixed centre pin means "the map centre is the
// selected point" (Zomato-style) - panning the map re-selects. Talks to RN via
// postMessage; RN drives it back with window.__setView(...).
const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background:#e7e7e5; }
  #pin { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -100%); z-index: 1000; pointer-events: none; font-size: 36px; line-height: 1; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<div id="pin">📍</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  function post(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  try {
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    var t;
    map.on('moveend', function(){
      var c = map.getCenter();
      clearTimeout(t);
      t = setTimeout(function(){ post({ type:'move', lat:c.lat, lng:c.lng }); }, 220);
    });
    window.__setView = function(lat, lng, zoom){ map.setView([lat, lng], zoom || 17); };
    post({ type:'ready' });
  } catch (e) { post({ type:'error', message: String(e) }); }
</script>
</body>
</html>`;

export function LocationPickerScreen({ navigation }: ScreenProps<'LocationPicker'>) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const webRef = useRef<WebView>(null);
  const setField = useApplicationDraft((s) => s.setField);

  const [selected, setSelected] = useState<GeoPlace | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [reverseBusy, setReverseBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const centerOn = (lat: number, lng: number, zoom = 17) =>
    webRef.current?.injectJavaScript(`window.__setView(${lat}, ${lng}, ${zoom}); true;`);

  // Reverse-geocode the map centre after it settles (debounced).
  useEffect(() => {
    if (!pending) return;
    setReverseBusy(true);
    const t = setTimeout(() => {
      reverseGeocode(pending.lat, pending.lng)
        .then((p) => {
          if (p) setSelected(p);
        })
        .catch(() => {})
        .finally(() => setReverseBusy(false));
    }, 400);
    return () => clearTimeout(t);
  }, [pending]);

  // Debounced address search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchPlaces(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'move') setPending({ lat: msg.lat, lng: msg.lng });
    } catch {
      // ignore malformed messages
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location permission',
            message: 'Allow Trendzo to detect your store location.',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          toast.show('Allow location access to detect your position', 'error');
          setLocating(false);
          return;
        }
      } else {
        Geolocation.requestAuthorization();
      }
      // Coarse/network FIRST — it returns in ~1-2s (or instantly from cache) and
      // is precise enough to drop the pin near the store, which the user drags to
      // fine-tune anyway. Only fall back to a slow GPS lock if coarse fails.
      let coords: { latitude: number; longitude: number };
      try {
        coords = await getPosition(false, 8000);
      } catch {
        coords = await getPosition(true, 10000);
      }
      centerOn(coords.latitude, coords.longitude, 17);
      setLocating(false);
    } catch {
      toast.show('Could not get your location. Search for your area instead.', 'error');
      setLocating(false);
    }
  };

  const pickResult = (p: GeoPlace) => {
    Keyboard.dismiss();
    setResults([]);
    setQuery('');
    setSelected(p);
    centerOn(p.lat, p.lng, 17);
  };

  const confirm = () => {
    if (!selected) return;
    if (selected.addressLine) setField('addressLine', selected.addressLine);
    if (selected.pincode) setField('pincode', selected.pincode);
    // GST state code from the geocoded state — backfills submissions whose
    // GSTIN can't provide it.
    const code = gstStateCode(selected.state);
    if (code) setField('stateCode', code);
    toast.show('Store location added', 'success');
    navigation.goBack();
  };

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.flex}>
        <WebView
          ref={webRef}
          // baseUrl gives the inline HTML an HTTPS origin. Without it, Android
          // WebView treats the page as about:blank (insecure) and — because the
          // default mixedContentMode is NEVER — silently BLOCKS the remote Leaflet
          // CDN + OSM tiles, so the map is blank on Android while iOS (which ignores
          // mixedContentMode) renders fine. mixedContentMode="always" is the belt.
          source={{ html: MAP_HTML, baseUrl: 'https://tile.openstreetmap.org/' }}
          originWhitelist={['*']}
          mixedContentMode="always"
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          onError={(e) => toast.show(`Map failed to load: ${e.nativeEvent.description}`, 'error')}
          onHttpError={(e) => toast.show(`Map resource error ${e.nativeEvent.statusCode}`, 'error')}
          style={styles.flex}
          renderLoading={() => (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={colors.ink} />
            </View>
          )}
          startInLoadingState
        />

        {/* Search bar + results */}
        <View style={[styles.searchWrap, { top: insets.top + spacing.sm }]}>
          <View style={styles.searchBar}>
            <BackButton onPress={() => navigation.goBack()} />
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.meta} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search area, street, landmark"
                placeholderTextColor={colors.inkMuted}
                autoCorrect={false}
                style={styles.searchInput}
              />
              {searching ? <ActivityIndicator size="small" color={colors.meta} /> : null}
            </View>
          </View>
          {results.length ? (
            <View style={styles.results}>
              {results.map((r, i) => (
                <PressableScale
                  key={`${r.lat}-${r.lng}-${i}`}
                  onPress={() => pickResult(r)}
                  haptic={false}
                  style={styles.resultRow}
                >
                  <Icon name="location-outline" size={16} color={colors.meta} />
                  <AppText variant="meta" color={colors.ink} numberOfLines={2} style={styles.flex}>
                    {r.displayName}
                  </AppText>
                </PressableScale>
              ))}
            </View>
          ) : null}
        </View>

        {/* Use my current location */}
        <PressableScale
          onPress={useCurrentLocation}
          style={[styles.locateFab, { bottom: bottomCardHeight(insets.bottom) + spacing.md }]}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Icon name="locate" size={20} color={colors.ink} />
          )}
        </PressableScale>

        {/* Selected address + confirm */}
        <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.md }]}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Selected location
          </AppText>
          <View style={styles.selectedRow}>
            <Icon name="location" size={18} color={colors.ink} />
            <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2} style={styles.flex}>
              {reverseBusy && !selected
                ? 'Locating…'
                : selected?.addressLine || selected?.displayName || 'Move the map to pick a spot'}
            </AppText>
          </View>
          {selected?.pincode ? (
            <AppText variant="meta" color={colors.meta}>
              PIN {selected.pincode}
              {selected.city ? ` · ${selected.city}` : ''}
            </AppText>
          ) : null}
          <PrimaryButton
            label="Confirm location"
            tone="accent"
            disabled={!selected}
            onPress={confirm}
          />
        </View>
      </View>
    </Screen>
  );
}

// Reserve room for the bottom card so the FAB sits just above it.
function bottomCardHeight(safeBottom: number): number {
  return 150 + safeBottom;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  searchWrap: { position: 'absolute', left: spacing.md, right: spacing.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 48,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typeScale.bodyMedium.fontFamily,
    fontSize: typeScale.bodyMedium.fontSize,
  },
  results: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locateFab: {
    position: 'absolute',
    right: spacing.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  bottomCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
