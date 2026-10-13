import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, orderBy, onSnapshot, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

import { sounds } from "./sound-effects.js";
import { exportMemeAsPng } from "./meme-generator.js";
import { getFirebaseConfig, saveFirebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { extractImageMetadata, formatCoords, formatExifDate } from "./exif-helper.js";

// DOM Selector Helper
const $ = (id) => document.getElementById(id);

// Application State
let app, auth, db, st;
let me = null;
let tid = null;
let trip = null;
let photos = [];
let comments = [];
let names = {};
let curPhoto = null;
let unsubs = [];
let expandedComments = {}; // Track expanded comment threads by photo ID
let isDemoMode = false;

// Demo In-Memory State for instant preview before user configures Firebase
let demoState = {
  trips: [
    {
      id: "demo-vibe-goa",
      title: "Goa Weekend 🌴",
      ownerId: "demo-user-1",
      members: ["demo-user-1", "demo-user-2", "demo-user-3"],
      createdAt: { toDate: () => new Date(Date.now() - 86400000) }
    },
    {
      id: "demo-vibe-hackathon",
      title: "Buildathon 2026 🚀",
      ownerId: "demo-user-1",
      members: ["demo-user-1", "demo-user-2"],
      createdAt: { toDate: () => new Date(Date.now() - 172800000) }
    }
  ],
  users: {
    "demo-user-1": { name: "Alex Chen", photo: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face" },
    "demo-user-2": { name: "Maya Patel", photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face" },
    "demo-user-3": { name: "Liam Smith", photo: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop&crop=face" }
  },
  photos: {
    "demo-vibe-goa": [
      {
        id: "p1",
        by: "demo-user-2",
        at: { toDate: () => new Date(Date.now() - 3600000) },
        kind: "image",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop",
        cap: "Sunset at Palolem beach was unreal!",
        top: "EXPECTATION: RELAXING",
        bot: "REALITY: SUNBURNT 😭",
        filter: "f-pop",
        sticker: "🔥",
        tags: ["demo-user-1", "demo-user-3"],
        reactions: { "❤️": ["demo-user-1", "demo-user-3"], "🔥": ["demo-user-1"] },
        metadata: {
          fileName: "sunset-palolem.jpg",
          fileSizeFormatted: "3.4 MB",
          takenAt: new Date(Date.now() - 3600000).toISOString(),
          takenAtFormatted: "Today, 04:30 PM",
          hasExifDate: true,
          isEstimatedDate: false,
          hasGps: true,
          latitude: 15.0100,
          longitude: 74.0231,
          altitude: 12,
          coordsFormatted: "15.0100° N, 74.0231° E",
          locationName: "Palolem Beach, South Goa, India",
          mapsUrl: "https://www.google.com/maps?q=15.0100,74.0231",
          camera: "Apple iPhone 15 Pro",
          make: "Apple",
          model: "iPhone 15 Pro",
          lens: "24mm f/1.78",
          iso: 50,
          fNumber: "f/1.8",
          exposureTime: "1/400s",
          focalLength: "24mm",
          width: 4032,
          height: 3024,
          rawExifFound: true
        }
      },
      {
        id: "p2",
        by: "demo-user-1",
        at: { toDate: () => new Date(Date.now() - 1800000) },
        kind: "text",
        cap: "Don't forget we have beach volleyball booked tomorrow at 9 AM! Bring sunscreen 🏖️",
        top: "",
        bot: "",
        filter: "",
        sticker: "",
        tags: [],
        reactions: { "🌴": ["demo-user-2", "demo-user-3"], "👏": ["demo-user-2"] }
      }
    ]
  },
  comments: {
    "demo-vibe-goa": [
      { id: "c1", pid: "p1", by: "demo-user-1", text: "Best evening of the entire trip!", at: { toDate: () => new Date() } },
      { id: "c2", pid: "p1", by: "demo-user-3", text: "Look at that meme text haha 😂", at: { toDate: () => new Date() } },
      { id: "c3", pid: "p1", by: "demo-user-2", text: "Next time getting 50+ SPF for sure.", at: { toDate: () => new Date() } }
    ]
  }
};

// Utilities
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const show = (n) => ["login", "trips", "trip"].forEach((s) => {
  const el = $(s);
  if (el) el.hidden = (s !== n);
});
const clearUnsubs = () => { unsubs.forEach((u) => u()); unsubs = []; };

// Toast notification helper
export function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

// Sound toggle initialization
function updateSoundIcon() {
  const btn = $("soundToggle");
  if (btn) {
    btn.textContent = sounds.isMuted() ? "🔇" : "🔊";
    btn.title = sounds.isMuted() ? "Sound Effects Muted" : "Sound Effects On";
  }
}

// Check configuration on load
export function initApp() {
  updateSoundIcon();
  const config = getFirebaseConfig();

  // Banner handling
  if (!isFirebaseConfigured()) {
    $("configBanner").hidden = false;
  } else {
    $("configBanner").hidden = true;
  }

  // Setup Firebase if configured
  if (isFirebaseConfigured()) {
    try {
      app = initializeApp(config);
      auth = getAuth(app);
      db = getFirestore(app);
      st = getStorage(app);

      // Handle redirect sign-in result if returned from redirect
      getRedirectResult(auth).catch((err) => {
        console.warn("Redirect sign in check:", err);
      });

      onAuthStateChanged(auth, async (u) => {
        me = u;
        clearUnsubs();
        if (!u) {
          return show("login");
        }

        // Navigate immediately!
        const inv = new URLSearchParams(location.search).get("trip");
        if (inv) {
          show("trip");
          openTrip(inv);
          // Background join
          updateDoc(doc(db, "trips", inv), { members: arrayUnion(u.uid) }).catch((e) => {
            console.warn("Invite join error:", e);
          });
          history.replaceState(null, "", location.pathname);
        } else {
          show("trips");
          listTrips();
        }

        // Sync user profile in background without blocking navigation
        setDoc(doc(db, "users", u.uid), {
          name: u.displayName || "Explorer",
          photo: u.photoURL || ""
        }, { merge: true }).catch((e) => {
          console.warn("User sync warning:", e);
        });
      });
    } catch (e) {
      console.error("Firebase init failed:", e);
    }
  } else {
    // Show login screen
    show("login");
  }

  setupEventListeners();
}

// Event Listeners
function setupEventListeners() {
  // Sound Mute Toggle
  const soundBtn = $("soundToggle");
  if (soundBtn) {
    soundBtn.onclick = () => {
      sounds.toggleMute();
      updateSoundIcon();
      if (!sounds.isMuted()) sounds.playPop();
    };
  }

  // Google Sign In with debounce and COOP-proof fallback
  let isSigningIn = false;

  const triggerGoogleSignIn = async (useRedirect = false) => {
    if (isSigningIn) return;
    isSigningIn = true;
    sounds.playTap();

    const gbtn = $("gbtn");
    const originalText = gbtn ? gbtn.innerHTML : "";
    if (gbtn) {
      gbtn.disabled = true;
      gbtn.style.opacity = "0.7";
      gbtn.innerHTML = `<span>⏳ Signing in...</span>`;
    }

    if (!isFirebaseConfigured()) {
      isSigningIn = false;
      if (gbtn) {
        gbtn.disabled = false;
        gbtn.style.opacity = "1";
        gbtn.innerHTML = originalText;
      }
      showConfigModal();
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (useRedirect) {
      console.log("👉 Using Google Redirect sign-in (bypassing popup COOP)...");
      try {
        await signInWithRedirect(auth, provider);
      } catch (e) {
        console.error("Redirect sign-in error:", e);
        alert("Sign in failed: " + e.message);
        isSigningIn = false;
        if (gbtn) {
          gbtn.disabled = false;
          gbtn.style.opacity = "1";
          gbtn.innerHTML = originalText;
        }
      }
      return;
    }

    try {
      console.log("👉 Opening Google Sign-in popup...");
      const res = await signInWithPopup(auth, provider);
      if (res && res.user) {
        console.log("✅ Signed in successfully:", res.user.displayName);
        me = res.user;
        show("trips");
        listTrips();
      }
    } catch (e) {
      console.error("Sign in error:", e);

      // Handle popup blocked or cancelled due to COOP / double-click
      if (e.code === "auth/cancelled-popup-request" || e.code === "auth/popup-blocked") {
        console.warn("Popup blocked or cancelled by browser COOP. Falling back to redirect sign-in...");
        showToast("Switching to direct sign-in… 🔄");
        setTimeout(() => {
          signInWithRedirect(auth, provider).catch((err) => {
            console.error("Redirect fallback error:", err);
            alert("Sign in failed: " + err.message);
          });
        }, 300);
        return;
      } else if (e.code === "auth/popup-closed-by-user") {
        console.log("User closed the popup.");
      } else if (e.code === "auth/configuration-not-found") {
        alert(
          "⚠️ Google Sign-In is not enabled in your Firebase project yet!\n\n" +
          "Quick fix (1 minute):\n" +
          "1. Open https://console.firebase.google.com/project/vibe-fling/authentication/providers\n" +
          "2. Click 'Get started' (if not yet started)\n" +
          "3. Select 'Google' under Sign-in providers\n" +
          "4. Toggle 'Enable', pick your support email, and click 'Save'.\n\n" +
          "Then return here and click Sign in again!"
        );
      } else if (e.code === "auth/unauthorized-domain") {
        alert(
          "⚠️ localhost is not in your Firebase Authorized Domains.\n\n" +
          "Go to https://console.firebase.google.com/project/vibe-fling/authentication/settings\n" +
          "Under 'Authorized domains', add 'localhost'."
        );
      } else {
        alert("Sign in failed: " + e.message);
      }
    } finally {
      isSigningIn = false;
      if (gbtn) {
        gbtn.disabled = false;
        gbtn.style.opacity = "1";
        gbtn.innerHTML = originalText;
      }
    }
  };

  $("gbtn").onclick = () => triggerGoogleSignIn(false);
  if ($("redirectBtnLogin")) $("redirectBtnLogin").onclick = () => triggerGoogleSignIn(true);

  // Demo Mode Buttons
  const demoClick = () => startDemoMode();
  if ($("demoBtn")) $("demoBtn").onclick = demoClick;
  if ($("demoBtnLogin")) $("demoBtnLogin").onclick = demoClick;

  // Sign out
  $("out").onclick = () => {
    sounds.playTap();
    if (isDemoMode) {
      me = null;
      isDemoMode = false;
      show("login");
      return;
    }
    signOut(auth);
  };

  // Create Vibe
  $("mk").onclick = async () => {
    const t = $("nt").value.trim();
    if (!t) return;
    $("nt").value = "";
    sounds.playChime();

    if (isDemoMode) {
      const newTrip = {
        id: "demo-" + Date.now(),
        title: t,
        ownerId: me.uid,
        members: [me.uid],
        createdAt: { toDate: () => new Date() }
      };
      demoState.trips.unshift(newTrip);
      demoState.photos[newTrip.id] = [];
      demoState.comments[newTrip.id] = [];
      openTrip(newTrip.id);
      return;
    }

    try {
      const r = await addDoc(collection(db, "trips"), {
        title: t,
        ownerId: me.uid,
        members: [me.uid],
        createdAt: serverTimestamp()
      });
      openTrip(r.id);
    } catch (e) {
      alert("Error creating vibe: " + e.message);
    }
  };

  // Back to list
  $("back").onclick = () => {
    sounds.playTap();
    listTrips();
  };

  // Invite Link
  $("inv").onclick = () => {
    sounds.playPop();
    const l = location.origin + location.pathname + "?trip=" + tid;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(l);
    }
    showToast("Invite link copied! Share it on WhatsApp 🌴");
  };

  // Media Attachment Button
  $("up").onclick = () => {
    sounds.playTap();
    $("file").click();
  };

  // Send Text Note or Upload
  $("sendBtn").onclick = () => {
    const text = $("msg").value.trim();
    if (!text) {
      $("file").click();
      return;
    }
    postTextMessage(text);
  };

  $("msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = $("msg").value.trim();
      if (text) postTextMessage(text);
    }
  });

  // File Upload Handler with EXIF (Date, GPS Location, Camera) Extraction
  $("file").onchange = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const cap = $("msg").value.trim();
    $("msg").value = "";
    sounds.playShutter();

    if (isDemoMode) {
      await handleDemoUpload(files, cap);
      e.target.value = "";
      return;
    }

    const total = files.length;
    let completed = 0;
    const progWrap = $("uploadProgress");
    const progBar = $("progressBar");
    if (progWrap) progWrap.hidden = false;

    for (let n = 0; n < files.length; n++) {
      const f = files[n];
      $("msg").placeholder = `Reading EXIF date & location (${n + 1}/${total})…`;

      // 1. Extract EXIF Date, Location GPS, and Camera using exifr
      let metadata = null;
      try {
        metadata = await extractImageMetadata(f);
      } catch (metaErr) {
        console.warn("Could not extract EXIF metadata:", metaErr);
      }

      const path = `trips/${tid}/${crypto.randomUUID()}`;
      const uploadOptions = {
        contentType: f.type,
        customMetadata: {
          takenAt: metadata?.takenAt || "",
          latitude: metadata?.latitude != null ? String(metadata.latitude) : "",
          longitude: metadata?.longitude != null ? String(metadata.longitude) : "",
          locationName: metadata?.locationName || "",
          camera: metadata?.camera || ""
        }
      };

      const task = uploadBytesResumable(ref(st, path), f, uploadOptions);

      task.on(
        "state_changed",
        (s) => {
          const pct = Math.round((100 * s.bytesTransferred) / (s.totalBytes || 1));
          if (progBar) progBar.style.width = `${pct}%`;
          $("msg").placeholder = `Uploading (${n + 1}/${total}) ${pct}%…`;
        },
        (err) => {
          alert("Upload error: " + err.message);
          if (progWrap) progWrap.hidden = true;
          $("msg").placeholder = "Message or photo caption…";
        },
        async () => {
          completed++;
          if (completed === total) {
            if (progWrap) progWrap.hidden = true;
            $("msg").placeholder = "Message or photo caption…";
            sounds.playChime();
            showToast("Upload complete with Date & Location metadata! 📸");
          }

          const url = await getDownloadURL(task.snapshot.ref);

          // 2. Store photo doc in Firestore WITH extracted date and location
          await addDoc(collection(db, "trips", tid, "photos"), {
            by: me.uid,
            at: serverTimestamp(),
            kind: f.type.startsWith("video") ? "video" : "image",
            url,
            path,
            cap: n === 0 ? cap : "",
            top: "",
            bot: "",
            filter: "",
            sticker: "",
            tags: [],
            reactions: {},
            metadata: metadata || null,
            exif: metadata || null
          });
        }
      );
    }
    e.target.value = "";
  };

  // Thread Event Delegation: Edit, Reactions, Comments, Export Meme
  $("thread").onclick = async (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const id = b.dataset.id;

    // Remix / Edit Meme Modal
    if (b.dataset.a === "edit") {
      sounds.playTap();
      const p = photos.find((x) => x.id === id);
      if (p) openEdit(p);
      return;
    }

    // View EXIF and Location Info Modal
    if (b.dataset.a === "view-exif") {
      sounds.playTap();
      const p = photos.find((x) => x.id === id);
      if (p) openExifModal(p);
      return;
    }

    // Direct Download Meme PNG
    if (b.dataset.a === "export") {
      sounds.playPop();
      const p = photos.find((x) => x.id === id);
      if (p) {
        showToast("Generating high-res meme PNG… 💾");
        await exportMemeAsPng(p, `${trip ? trip.title.replace(/\s+/g, "-") : "vibe"}-${id}`);
        showToast("Meme saved! 🎉");
      }
      return;
    }

    // Toggle comments collapse
    if (b.dataset.a === "toggle-comments") {
      sounds.playTap();
      expandedComments[id] = !expandedComments[id];
      draw();
      return;
    }

    // React with Emoji
    if (b.dataset.a === "react") {
      const emoji = b.dataset.emoji;
      toggleReaction(id, emoji);
      return;
    }

    // Add new reaction picker popup
    if (b.dataset.a === "add-reaction") {
      const emoji = prompt("Pick an emoji reaction (e.g. ❤️, 🔥, 😂, 💀, 🌴, 👏, 🎉):", "🔥");
      if (emoji && emoji.trim()) {
        toggleReaction(id, emoji.trim());
      }
      return;
    }

    // Submit Comment
    if (b.dataset.a === "cm") {
      const i = $("thread").querySelector(`.ci[data-id="${id}"]`);
      if (!i) return;
      const text = i.value.trim();
      if (!text) return;
      i.value = "";
      sounds.playTap();
      addComment(id, text);
    }
  };

  // Modal Controls
  $("closeModal").onclick = () => {
    $("modal").hidden = true;
  };

  const closeExifModal = () => {
    const el = $("exifModal");
    if (el) el.hidden = true;
  };
  if ($("closeExifModal")) $("closeExifModal").onclick = closeExifModal;
  if ($("closeExifModalBtn")) $("closeExifModalBtn").onclick = closeExifModal;

  $("saveModal").onclick = async () => {
    if (!curPhoto) return;
    sounds.playChime();
    const updateData = {
      top: $("top").value.trim(),
      bot: $("bot").value.trim(),
      filter: $("flt").value,
      sticker: $("stk").value,
      tags: [...$("tg").querySelectorAll("input:checked")].map((i) => i.value)
    };

    if (isDemoMode) {
      Object.assign(curPhoto, updateData);
      $("modal").hidden = true;
      draw();
      showToast("Remix saved!");
      return;
    }

    try {
      await updateDoc(doc(db, "trips", tid, "photos", curPhoto.id), updateData);
      $("modal").hidden = true;
      showToast("Remix saved!");
    } catch (e) {
      alert("Error updating meme: " + e.message);
    }
  };

  $("exportModal").onclick = async () => {
    if (!curPhoto) return;
    sounds.playPop();
    const previewPhoto = {
      ...curPhoto,
      top: $("top").value.trim(),
      bot: $("bot").value.trim(),
      filter: $("flt").value,
      sticker: $("stk").value
    };
    showToast("Generating meme PNG… 💾");
    await exportMemeAsPng(previewPhoto, `vibe-remix-${curPhoto.id}`);
    showToast("Meme saved! 🎉");
  };

  // Real-time Meme Preview inside Modal
  ["top", "bot", "flt", "stk"].forEach((field) => {
    $(field).addEventListener("input", updateModalPreview);
    $(field).addEventListener("change", updateModalPreview);
  });

  // Config modal buttons
  $("openConfigBtn").onclick = showConfigModal;
  $("closeConfigModal").onclick = () => { $("configModal").hidden = true; };
  $("saveConfigBtn").onclick = () => {
    const raw = $("configInput").value.trim();
    if (!raw) return;
    try {
      let cfg;
      if (raw.startsWith("{")) {
        cfg = JSON.parse(raw);
      } else {
        // Simple key extraction fallback
        const apiKeyMatch = raw.match(/apiKey:\s*["']([^"']+)["']/);
        const projectIdMatch = raw.match(/projectId:\s*["']([^"']+)["']/);
        if (apiKeyMatch && projectIdMatch) {
          cfg = {
            apiKey: apiKeyMatch[1],
            projectId: projectIdMatch[1],
            authDomain: `${projectIdMatch[1]}.firebaseapp.com`,
            storageBucket: `${projectIdMatch[1]}.firebasestorage.app`
          };
        }
      }
      if (cfg && cfg.apiKey) {
        saveFirebaseConfig(cfg);
        showToast("Firebase Config saved! Reloading…");
        setTimeout(() => location.reload(), 800);
      } else {
        alert("Please paste a valid Firebase configuration JSON.");
      }
    } catch (e) {
      alert("Invalid JSON format. Please paste the config object from Firebase console.");
    }
  };
}

// Post a text-only note/message
async function postTextMessage(text) {
  sounds.playTap();
  $("msg").value = "";

  if (isDemoMode) {
    demoState.photos[tid].push({
      id: "p-" + Date.now(),
      by: me.uid,
      at: { toDate: () => new Date() },
      kind: "text",
      cap: text,
      top: "",
      bot: "",
      filter: "",
      sticker: "",
      tags: [],
      reactions: {}
    });
    draw();
    return;
  }

  try {
    await addDoc(collection(db, "trips", tid, "photos"), {
      by: me.uid,
      at: serverTimestamp(),
      kind: "text",
      cap: text,
      top: "",
      bot: "",
      filter: "",
      sticker: "",
      tags: [],
      reactions: {}
    });
  } catch (e) {
    alert("Error posting message: " + e.message);
  }
}

// Toggle an Emoji Reaction
async function toggleReaction(photoId, emoji) {
  sounds.playPop();
  const photo = photos.find((p) => p.id === photoId);
  if (!photo) return;

  const reactions = { ...(photo.reactions || {}) };
  const userList = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];

  const uid = me.uid;
  const existsIndex = userList.indexOf(uid);

  if (existsIndex > -1) {
    userList.splice(existsIndex, 1);
  } else {
    userList.push(uid);
  }

  if (userList.length === 0) {
    delete reactions[emoji];
  } else {
    reactions[emoji] = userList;
  }

  if (isDemoMode) {
    photo.reactions = reactions;
    draw();
    return;
  }

  try {
    await updateDoc(doc(db, "trips", tid, "photos", photoId), { reactions });
  } catch (e) {
    console.error("Reaction update error:", e);
  }
}

// Add Comment
async function addComment(photoId, text) {
  if (isDemoMode) {
    demoState.comments[tid].push({
      id: "c-" + Date.now(),
      pid: photoId,
      by: me.uid,
      text,
      at: { toDate: () => new Date() }
    });
    draw();
    return;
  }

  try {
    await addDoc(collection(db, "trips", tid, "comments"), {
      pid: photoId,
      by: me.uid,
      at: serverTimestamp(),
      text
    });
  } catch (e) {
    console.error("Error adding comment:", e);
  }
}

// Start Demo Mode
function startDemoMode() {
  isDemoMode = true;
  me = {
    uid: "demo-user-1",
    displayName: "Alex Chen (You)",
    photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face"
  };
  names = { ...demoState.users };
  sounds.playChime();
  showToast("Demo Mode active! Try creating, commenting & remixing 🎉");
  listTrips();
}

// List Trips (Vibes)
function listTrips() {
  clearUnsubs();
  show("trips");

  // Render current user badge
  if (me) {
    const badge = $("userBadge");
    if (badge) {
      badge.innerHTML = `
        <span class="av" style="width: 28px; height: 28px; font-size: 11px; ${me.photoURL ? `background-image:url(${esc(me.photoURL)})` : ''}">${me.photoURL ? '' : esc(me.displayName ? me.displayName[0] : 'U')}</span>
        <span style="font-size: 12.5px; font-weight: 600; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(me.displayName || 'You')}</span>
      `;
    }
  }

  if (isDemoMode) {
    renderTripList(demoState.trips);
    return;
  }

  unsubs.push(
    onSnapshot(
      query(collection(db, "trips"), where("members", "array-contains", me.uid)),
      (snapshot) => {
        const tripList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderTripList(tripList);
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
        const container = $("tl");
        if (err.code === "permission-denied") {
          container.innerHTML = `
            <div style="background: rgba(255, 3, 62, 0.08); border: 1px solid rgba(255, 3, 62, 0.3); border-radius: 14px; padding: 16px; margin-bottom: 12px;">
              <div style="font-weight: 700; color: #FF033E; margin-bottom: 6px;">🔒 Firestore Rules Blocked Access</div>
              <p style="font-size: 13px; color: var(--ink-secondary); line-height: 1.5; margin-bottom: 10px;">
                Your Firestore database is in production mode. Please copy the rules from <code>firestore.rules</code> and publish them in your Firebase Console.
              </p>
              <a href="https://console.firebase.google.com/project/vibe-fling/firestore/rules" target="_blank" class="btn sm" style="text-decoration: none; display: inline-flex;">
                Open Firestore Rules →
              </a>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div style="text-align: center; padding: 24px 16px; color: var(--ink-secondary);">
              <p style="font-size: 24px; margin-bottom: 6px;">⚠️</p>
              <p style="font-weight: 600; font-size: 14px;">Firestore Notice</p>
              <p style="font-size: 12px; color: var(--ink-muted); margin-top: 4px;">${esc(err.message)}</p>
              <p style="font-size: 12px; color: var(--ink-muted); margin-top: 8px;">Ensure Firestore Database is created at <a href="https://console.firebase.google.com/project/vibe-fling/firestore" target="_blank" style="color:#FF033E;">Firebase Console</a>.</p>
            </div>
          `;
        }
      }
    )
  );
}

function renderTripList(tripList) {
  const container = $("tl");
  container.innerHTML = "";

  if (tripList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--ink-secondary);">
        <p style="font-size: 28px; margin-bottom: 8px;">🌴</p>
        <p style="font-weight: 600; margin-bottom: 4px;">No vibes yet</p>
        <p style="font-size: 13px; color: var(--ink-muted);">Create your first group album below!</p>
      </div>
    `;
    return;
  }

  tripList.forEach((d) => {
    const card = document.createElement("div");
    card.className = "trip-card";
    const memberCount = d.members ? d.members.length : 1;
    card.innerHTML = `
      <div class="trip-card-content">
        <div class="trip-card-title">🌴 ${esc(d.title)}</div>
        <div class="trip-card-meta">
          <span>👥 ${memberCount} ${memberCount === 1 ? "member" : "members"}</span>
        </div>
      </div>
      <button class="btn sm alt">Open →</button>
    `;
    card.onclick = () => {
      sounds.playTap();
      openTrip(d.id);
    };
    container.appendChild(card);
  });
}

// Open a specific Trip (Vibe)
function openTrip(id) {
  clearUnsubs();
  tid = id;
  show("trip");

  if (isDemoMode) {
    trip = demoState.trips.find((t) => t.id === id) || { id, title: "Demo Vibe", members: [me.uid] };
    $("tt").textContent = trip.title;
    photos = demoState.photos[id] || [];
    comments = demoState.comments[id] || [];
    draw();
    return;
  }

  // Listen to trip document
  unsubs.push(
    onSnapshot(
      doc(db, "trips", id),
      async (s) => {
        trip = s.data();
        if (!trip) return;
        $("tt").textContent = trip.title;

        // Fetch member profiles
        for (const u of trip.members || []) {
          if (!names[u]) {
            try {
              const d = await getDoc(doc(db, "users", u));
              names[u] = d.data() || { name: "Explorer" };
            } catch (e) {
              names[u] = { name: "Explorer" };
            }
          }
        }
        draw();
      },
      (err) => console.error("Trip listen error:", err)
    )
  );

  // Listen to photos
  unsubs.push(
    onSnapshot(
      query(collection(db, "trips", id, "photos"), orderBy("at", "asc")),
      (s) => {
        photos = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        draw();
      },
      (err) => console.error("Photos listen error:", err)
    )
  );

  // Listen to comments
  unsubs.push(
    onSnapshot(
      query(collection(db, "trips", id, "comments"), orderBy("at", "asc")),
      (s) => {
        comments = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        draw();
      },
      (err) => console.error("Comments listen error:", err)
    )
  );
}

// Render Media and Overlay
const mediaHtml = (p) => {
  if (p.kind === "text") {
    return `<div class="text-post-card">"${esc(p.cap)}"</div>`;
  }
  const element = p.kind === "video"
    ? `<video src="${esc(p.url)}" controls playsinline class="${esc(p.filter || "")}"></video>`
    : `<img src="${esc(p.url)}" class="${esc(p.filter || "")}" alt="Vibe photo" loading="lazy">`;

  return `
    <div class="m">
      ${element}
      <div class="ov">
        <b>${esc(p.top)}</b>
        <i>${esc(p.sticker || "")}</i>
        <b>${esc(p.bot)}</b>
      </div>
    </div>
  `;
};

// Render Feed Thread
function draw() {
  const th = $("thread");
  if (!th) return;

  // Preserve existing unsent comment inputs
  const unsentValues = {};
  th.querySelectorAll(".ci").forEach((i) => {
    if (i.value) unsentValues[i.dataset.id] = i.value;
  });

  if (photos.length === 0) {
    th.innerHTML = `
      <div style="text-align: center; margin: auto; padding: 40px 16px; color: var(--ink-secondary);">
        <div style="font-size: 40px; margin-bottom: 12px;">📸</div>
        <h3 style="margin-bottom: 6px;">This vibe is just getting started!</h3>
        <p style="font-size: 13.5px; color: var(--ink-muted); max-width: 300px; margin: 0 auto 18px;">
          Tap the paperclip 📎 below to drop the first photo or video, or send an invite link to friends.
        </p>
      </div>
    `;
    return;
  }

  const defaultReactions = ["❤️", "🔥", "😂", "💀", "🌴", "👏"];

  th.innerHTML = photos.map((p) => {
    const u = names[p.by] || { name: "Explorer" };
    const timeStr = p.at?.toDate?.().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "";
    const isMe = p.by === me.uid;

    // Reactions HTML
    const reactionsData = p.reactions || {};
    const reactionKeys = Object.keys(reactionsData);

    const activeReactionsHtml = reactionKeys.map((emoji) => {
      const uids = reactionsData[emoji] || [];
      const userReacted = uids.includes(me.uid);
      return `
        <button class="reaction-pill ${userReacted ? "reacted" : ""}" data-a="react" data-id="${p.id}" data-emoji="${emoji}">
          <span>${emoji}</span>
          <span style="font-size: 11px;">${uids.length}</span>
        </button>
      `;
    }).join("");

    const quickPicksHtml = defaultReactions
      .filter((e) => !reactionsData[e])
      .slice(0, 3)
      .map((emoji) => `
        <button class="reaction-pill" data-a="react" data-id="${p.id}" data-emoji="${emoji}" style="opacity: 0.6;">
          <span>${emoji}</span>
        </button>
      `)
      .join("");

    // Comments HTML & Collapsing
    const photoComments = comments.filter((c) => c.pid === p.id);
    const isExpanded = Boolean(expandedComments[p.id]);
    const commentCount = photoComments.length;

    let displayedComments = photoComments;
    let collapseToggleHtml = "";

    if (commentCount > 2 && !isExpanded) {
      displayedComments = photoComments.slice(-2);
      collapseToggleHtml = `
        <button class="toggle-comments-btn" data-a="toggle-comments" data-id="${p.id}">
          💬 View all ${commentCount} comments
        </button>
      `;
    } else if (commentCount > 2 && isExpanded) {
      collapseToggleHtml = `
        <button class="toggle-comments-btn" data-a="toggle-comments" data-id="${p.id}">
          ▲ Hide comments
        </button>
      `;
    }

    const commentsListHtml = displayedComments.map((c) => `
      <div class="cm">
        <b>${esc(names[c.by]?.name || "Explorer")}</b>
        <span>${esc(c.text)}</span>
      </div>
    `).join("");

    // EXIF Metadata Badges (Date Taken, GPS Location, Camera)
    const meta = p.metadata || p.exif;
    let metaBadgesHtml = "";
    if (meta && p.kind !== "text") {
      const pills = [];

      // Date Taken Pill
      if (meta.takenAtFormatted) {
        pills.push(`
          <span class="meta-pill date-pill" title="Photo Taken Date${meta.hasExifDate ? ' (EXIF DateTimeOriginal)' : ''}">
            📅 ${esc(meta.takenAtFormatted)}
          </span>
        `);
      }

      // Location Pill (Direct Google Maps link)
      if (meta.hasGps && meta.latitude != null && meta.longitude != null) {
        const placeLabel = meta.locationName || meta.coordsFormatted || "View Map";
        pills.push(`
          <a class="meta-pill location-pill" href="${esc(meta.mapsUrl)}" target="_blank" rel="noopener noreferrer" title="GPS: ${esc(meta.coordsFormatted || '')} · Open in Google Maps">
            📍 ${esc(placeLabel)} ↗
          </a>
        `);
      }

      // Camera Device Pill
      if (meta.camera) {
        pills.push(`
          <span class="meta-pill camera-pill" title="${esc([meta.camera, meta.lens, meta.fNumber, meta.exposureTime].filter(Boolean).join(' · '))}">
            📷 ${esc(meta.camera)}
          </span>
        `);
      }

      // Details Inspector Button
      pills.push(`
        <button class="meta-pill info-pill" data-a="view-exif" data-id="${p.id}" title="Inspect full EXIF & location metadata">
          ℹ️ Info
        </button>
      `);

      if (pills.length > 0) {
        metaBadgesHtml = `<div class="meta-badge-row">${pills.join("")}</div>`;
      }
    }

    return `
      <div class="msg ${isMe ? "me" : ""}">
        <span class="av" style="${u.photo ? `background-image:url(${esc(u.photo)})` : ""}">
          ${u.photo ? "" : esc(u.name ? u.name[0] : "?")}
        </span>
        <div class="col">
          <div class="who">
            <b>${esc(u.name)}</b> · <span>${timeStr}</span>
          </div>
          <div class="bub">
            ${mediaHtml(p)}
            ${metaBadgesHtml}
            ${p.kind !== "text" && p.cap ? `<div class="tx">${esc(p.cap)}</div>` : ""}

            <div class="sm">
              <div class="tags-row">
                ${(p.tags || []).map((x) => `<span class="tag-badge">@${esc(names[x]?.name || "friend")}</span>`).join(" ")}
              </div>
              <div class="action-links">
                ${p.kind !== "text" ? `
                  <button data-a="view-exif" data-id="${p.id}" title="Inspect EXIF date & location">📍 Info</button>
                  <button data-a="edit" data-id="${p.id}">✏️ Remix meme</button>
                  <button data-a="export" data-id="${p.id}">📥 Save PNG</button>
                ` : `
                  <button data-a="export" data-id="${p.id}">📥 Save Card</button>
                `}
              </div>
            </div>

            <!-- Reactions Bar -->
            <div class="reactions-bar">
              ${activeReactionsHtml}
              ${quickPicksHtml}
              <button class="add-reaction-btn" data-a="add-reaction" data-id="${p.id}">+ React</button>
            </div>
          </div>

          <!-- Comments Section -->
          <div class="comments-section">
            ${collapseToggleHtml}
            ${commentsListHtml}
            <div class="cin">
              <input class="ci" data-id="${p.id}" placeholder="Write a comment…">
              <button class="btn sm" data-a="cm" data-id="${p.id}">Reply</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Restore preserved input texts
  th.querySelectorAll(".ci").forEach((i) => {
    if (unsentValues[i.dataset.id]) i.value = unsentValues[i.dataset.id];
  });
}

// Edit / Remix Meme Modal
function openEdit(p) {
  curPhoto = p;
  $("top").value = p.top || "";
  $("bot").value = p.bot || "";
  $("flt").value = p.filter || "";
  $("stk").value = p.sticker || "";

  // Update modal EXIF badge
  const modalExif = $("modalExifBadge");
  if (modalExif) {
    const meta = p.metadata || p.exif;
    if (meta && (meta.takenAtFormatted || meta.locationName || meta.coordsFormatted || meta.camera)) {
      const parts = [];
      if (meta.takenAtFormatted) parts.push(`📅 ${meta.takenAtFormatted}`);
      if (meta.locationName || meta.coordsFormatted) parts.push(`📍 ${meta.locationName || meta.coordsFormatted}`);
      if (meta.camera) parts.push(`📷 ${meta.camera}`);

      modalExif.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--ink-secondary); background: var(--bg-surface-elevated); padding: 7px 12px; border-radius: var(--radius-md); border: 1px solid var(--line-subtle); margin-bottom: 8px;">
          ${parts.map((pt) => `<span>${esc(pt)}</span>`).join(" · ")}
        </div>
      `;
    } else {
      modalExif.innerHTML = "";
    }
  }

  updateModalPreview();

  // Member tags checkboxes
  const membersList = trip?.members || [me.uid];
  $("tg").innerHTML = `
    <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Tag members:</div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
      ${membersList.map((u) => `
        <label style="display: inline-flex; align-items: center; gap: 6px; background: var(--bg-surface-elevated); padding: 5px 10px; border-radius: var(--radius-full); font-size: 13px; cursor: pointer;">
          <input type="checkbox" value="${u}" ${(p.tags || []).includes(u) ? "checked" : ""} style="width: auto;">
          <span>${esc(names[u]?.name || "Explorer")}</span>
        </label>
      `).join("")}
    </div>
  `;

  $("modal").hidden = false;
}

function updateModalPreview() {
  if (!curPhoto) return;
  const tempPhoto = {
    ...curPhoto,
    top: $("top").value,
    bot: $("bot").value,
    filter: $("flt").value,
    sticker: $("stk").value
  };
  $("mm").innerHTML = mediaHtml(tempPhoto);
}

// Open Photo EXIF & Location Inspector Modal
function openExifModal(p) {
  const modal = $("exifModal");
  const body = $("exifModalBody");
  if (!modal || !body) return;

  const meta = p.metadata || p.exif || {};
  const hasGps = Boolean(meta.hasGps && meta.latitude != null && meta.longitude != null);

  body.innerHTML = `
    ${p.kind !== "text" && p.url ? `
      <img src="${esc(p.url)}" alt="Photo preview" class="exif-preview-thumb">
    ` : ""}

    <div style="font-size: 13px; color: var(--ink-secondary); margin-bottom: 8px;">
      Original photo metadata extracted using <code>exifr</code> &amp; stored in Firebase:
    </div>

    <div class="exif-details-grid">
      <!-- Date Taken -->
      <div class="exif-detail-item">
        <span class="exif-detail-label">📅 Date Taken</span>
        <span class="exif-detail-value">
          ${meta.takenAtFormatted ? esc(meta.takenAtFormatted) : (meta.takenAt ? new Date(meta.takenAt).toLocaleString() : "Not found in EXIF")}
        </span>
        <span style="font-size: 11px; color: var(--ink-muted);">
          ${meta.hasExifDate ? "✓ Genuine EXIF DateTimeOriginal" : (meta.isEstimatedDate ? "ℹ From file last modified" : "No date header in file")}
        </span>
      </div>

      <!-- GPS Coordinates -->
      <div class="exif-detail-item">
        <span class="exif-detail-label">📍 GPS Coordinates</span>
        <span class="exif-detail-value">
          ${hasGps ? esc(meta.coordsFormatted || `${meta.latitude.toFixed(4)}, ${meta.longitude.toFixed(4)}`) : "No GPS data"}
        </span>
        <span style="font-size: 11px; color: var(--ink-muted);">
          ${hasGps ? (meta.altitude != null ? `Altitude: ${meta.altitude}m` : "GPS Locked") : "Photos forwarded via chat apps lack GPS"}
        </span>
      </div>

      <!-- Detected Location Place -->
      ${meta.locationName ? `
        <div class="exif-detail-item" style="grid-column: 1 / -1;">
          <span class="exif-detail-label">🌍 Detected Place</span>
          <span class="exif-detail-value" style="color: #047857;">${esc(meta.locationName)}</span>
        </div>
      ` : ""}

      <!-- Camera Model -->
      <div class="exif-detail-item">
        <span class="exif-detail-label">📷 Device / Camera</span>
        <span class="exif-detail-value">${esc(meta.camera || meta.model || "Unknown Camera")}</span>
        <span style="font-size: 11px; color: var(--ink-muted);">${esc(meta.lens || "Standard lens")}</span>
      </div>

      <!-- Optics & Exposure -->
      <div class="exif-detail-item">
        <span class="exif-detail-label">⚙️ Camera Settings</span>
        <span class="exif-detail-value">
          ${[meta.fNumber, meta.exposureTime, meta.iso ? `ISO ${meta.iso}` : null, meta.focalLength].filter(Boolean).join(" · ") || "Standard auto"}
        </span>
        <span style="font-size: 11px; color: var(--ink-muted);">Optical profile</span>
      </div>

      <!-- Dimensions & File Size -->
      <div class="exif-detail-item">
        <span class="exif-detail-label">📐 Resolution &amp; Size</span>
        <span class="exif-detail-value">
          ${meta.width && meta.height ? `${meta.width} × ${meta.height} px` : "Original resolution"}
        </span>
        <span style="font-size: 11px; color: var(--ink-muted);">${esc(meta.fileSizeFormatted || "Full quality")}</span>
      </div>

      <!-- Firebase Storage -->
      <div class="exif-detail-item">
        <span class="exif-detail-label">☁️ Firebase Storage</span>
        <span class="exif-detail-value" style="font-size: 11.5px; font-family: monospace;">
          ${esc(p.path || "cloud-storage/original")}
        </span>
        <span style="font-size: 11px; color: #10B981;">✓ Stored in Cloud Firestore &amp; Storage</span>
      </div>
    </div>

    ${hasGps && meta.mapsUrl ? `
      <a href="${esc(meta.mapsUrl)}" target="_blank" rel="noopener noreferrer" class="exif-map-cta">
        🗺️ Open Location in Google Maps ↗
      </a>
    ` : ""}
  `;

  modal.hidden = false;
}

// Demo Upload Simulator with EXIF Extraction
async function handleDemoUpload(files, cap) {
  for (let idx = 0; idx < files.length; idx++) {
    const f = files[idx];
    let metadata = null;
    try {
      metadata = await extractImageMetadata(f);
    } catch (err) {
      console.warn("Demo EXIF error:", err);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const isVid = f.type.startsWith("video");
      demoState.photos[tid].push({
        id: "p-" + Date.now() + "-" + idx,
        by: me.uid,
        at: { toDate: () => new Date() },
        kind: isVid ? "video" : "image",
        url: dataUrl,
        path: `demo-storage/${f.name}`,
        cap: idx === 0 ? cap : "",
        top: "",
        bot: "",
        filter: "",
        sticker: "",
        tags: [],
        reactions: {},
        metadata: metadata,
        exif: metadata
      });
      draw();
      sounds.playChime();
      showToast("Uploaded photo with EXIF date & location! 📸");
    };
    reader.readAsDataURL(f);
  }
}

function showConfigModal() {
  $("configModal").hidden = false;
  const cur = getFirebaseConfig();
  if (cur.apiKey && cur.apiKey !== "YOUR_API_KEY") {
    $("configInput").value = JSON.stringify(cur, null, 2);
  }
}

// Initialize on DOM load or immediately if document is already ready
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
