import exifr from "./vendor/exifr.js";

/**
 * Format bytes into human-readable string (KB, MB, GB).
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format decimal latitude and longitude into degrees format (e.g. 15.0123° N, 74.0234° E).
 */
export function formatCoords(lat, lng) {
  if (lat == null || lng == null) return null;
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

/**
 * Format date into a friendly readable string: "12 Oct 2026, 04:30 PM".
 */
export function formatExifDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }) + ", " + date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

/**
 * Lightweight reverse geocoding via OpenStreetMap Nominatim with safe timeout.
 * Returns place name like "Palolem Beach, Canacona, India".
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "Accept-Language": "en" }
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};

    const placeParts = [
      addr.beach || addr.tourism || addr.historic || addr.leisure || addr.amenity,
      addr.suburb || addr.neighbourhood || addr.city_district || addr.village || addr.town || addr.city,
      addr.state_district || addr.state,
      addr.country
    ].filter(Boolean);

    if (placeParts.length > 0) {
      return [...new Set(placeParts)].slice(0, 3).join(", ");
    }

    if (data.display_name) {
      return data.display_name.split(",").slice(0, 3).map((s) => s.trim()).join(", ");
    }
    return null;
  } catch (err) {
    // Timeout or network error - gracefully return null
    return null;
  }
}

/**
 * Extract comprehensive EXIF metadata (taken date, GPS location, camera details)
 * from a given File or Blob object using exifr.
 */
export async function extractImageMetadata(file) {
  if (!file) return null;

  const result = {
    fileName: file.name || "photo",
    fileSize: file.size || 0,
    fileSizeFormatted: formatFileSize(file.size || 0),
    fileType: file.type || "image/jpeg",
    // Date metadata
    takenAt: null,
    takenAtFormatted: null,
    hasExifDate: false,
    isEstimatedDate: false,
    // Location metadata
    hasGps: false,
    latitude: null,
    longitude: null,
    altitude: null,
    coordsFormatted: null,
    mapsUrl: null,
    locationName: null,
    // Camera metadata
    make: null,
    model: null,
    camera: null,
    lens: null,
    iso: null,
    fNumber: null,
    exposureTime: null,
    focalLength: null,
    width: null,
    height: null,
    rawExifFound: false
  };

  // Only attempt EXIF parse if it's an image
  if (file.type && !file.type.startsWith("image/")) {
    return result;
  }

  try {
    // 1. Parse EXIF segments using exifr
    const parsed = await exifr.parse(file, {
      tiff: true,
      xmp: true,
      icc: false,
      iptc: false,
      gps: true,
      revivers: true
    }).catch(() => null);

    // 2. Parse GPS explicitly for coordinates
    const gpsData = await exifr.gps(file).catch(() => null);

    if (parsed || gpsData) {
      result.rawExifFound = true;
    }

    // 3. Extract and normalize photo taken date
    const candidateDate = parsed?.DateTimeOriginal || parsed?.CreateDate || parsed?.ModifyDate;
    if (candidateDate) {
      const parsedDate = candidateDate instanceof Date ? candidateDate : new Date(candidateDate);
      if (!isNaN(parsedDate.getTime())) {
        result.takenAt = parsedDate.toISOString();
        result.takenAtFormatted = formatExifDate(parsedDate);
        result.hasExifDate = true;
      }
    }

    // Fallback to file.lastModified if EXIF date not in header
    if (!result.takenAt && file.lastModified) {
      const fileDate = new Date(file.lastModified);
      if (!isNaN(fileDate.getTime())) {
        result.takenAt = fileDate.toISOString();
        result.takenAtFormatted = formatExifDate(fileDate);
        result.isEstimatedDate = true;
      }
    }

    // 4. Extract GPS coordinates
    const lat = gpsData?.latitude ?? parsed?.latitude;
    const lng = gpsData?.longitude ?? parsed?.longitude;
    const alt = gpsData?.altitude ?? parsed?.GPSAltitude;

    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      result.hasGps = true;
      result.latitude = Number(lat);
      result.longitude = Number(lng);
      result.altitude = alt != null && !isNaN(alt) ? Math.round(Number(alt)) : null;
      result.coordsFormatted = formatCoords(result.latitude, result.longitude);
      result.mapsUrl = `https://www.google.com/maps?q=${result.latitude},${result.longitude}`;

      // Attempt reverse geocoding for human-friendly place name
      result.locationName = await reverseGeocode(result.latitude, result.longitude);
    }

    // 5. Extract Camera & Lens details
    if (parsed) {
      if (parsed.Make) result.make = String(parsed.Make).trim();
      if (parsed.Model) result.model = String(parsed.Model).trim();

      // Clean up camera label (e.g. avoid "Apple Apple iPhone 15")
      if (result.make && result.model) {
        if (result.model.toLowerCase().includes(result.make.toLowerCase())) {
          result.camera = result.model;
        } else {
          result.camera = `${result.make} ${result.model}`;
        }
      } else {
        result.camera = result.model || result.make || null;
      }

      if (parsed.LensModel) result.lens = String(parsed.LensModel).trim();
      if (parsed.ISO != null) result.iso = Number(parsed.ISO);
      if (parsed.FNumber != null) result.fNumber = `f/${Number(parsed.FNumber).toFixed(1)}`;
      if (parsed.FocalLength != null) result.focalLength = `${Math.round(Number(parsed.FocalLength))}mm`;

      if (parsed.ExposureTime != null) {
        const exp = Number(parsed.ExposureTime);
        result.exposureTime = exp < 1 ? `1/${Math.round(1 / exp)}s` : `${exp}s`;
      }

      const w = parsed.ImageWidth || parsed.ExifImageWidth;
      const h = parsed.ImageHeight || parsed.ExifImageHeight;
      if (w) result.width = Number(w);
      if (h) result.height = Number(h);
    }

  } catch (err) {
    console.warn("EXIF extraction encountered a non-fatal error:", err);
  }

  return result;
}
