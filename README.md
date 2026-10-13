# 🌴 Vibefling: Firebase Starter

> Full-quality group album vibes with Google Sign-in, Firestore real-time data, Cloud Storage media preservation, meme remixing, emoji reactions, and sound effects.

---

## ✨ Features Included

- **📸 Original-Quality Media**: Upload photos and videos without compression directly to Google Cloud Storage (`trips/{tripId}/{uuid}`).
- **⚡ Real-time Sync**: Live updates powered by Cloud Firestore for new uploads, comments, member changes, and emoji reactions.
- **🎨 Meme & Remix Studio**: Add top and bottom text (classic Impact meme styling), color filters (Black & White, Old School Sepia, Pop, Deep Fried), and emoji stickers (`😂`, `💀`, `🔥`, `🤡`, `👑`, `🌴`, `🚀`).
- **💾 "Save Meme" PNG Export**: Built-in canvas export that generates and downloads a high-resolution `.png` with filters, meme text, and stickers applied.
- **❤️ Emoji Reactions**: Quick reactions (`❤️`, `🔥`, `😂`, `💀`, `🌴`, `👏`) with real-time counters and member feedback.
- **💬 Collapsible Comments**: Clean thread design with compact display for active conversations and inline replies.
- **📝 Text-only Quick Notes**: Share announcements or messages in the vibe thread even without an image.
- **🔊 Synthesized Web Audio Sound Effects**: Tactile sound feedback for shutter clicks, emoji reaction pops, chime on new vibes, and comment taps (includes a mute toggle).
- **🔗 1-Tap Invite Links**: Generate secret invite URLs (`?trip={tripId}`) formatted for WhatsApp or group chats. Joining automatically enrolls friends into the vibe.
- **🔒 Security Rules**: Production-ready `firestore.rules` and `storage.rules` restricting read and write access strictly to authenticated vibe members.

---

## 🚀 15-Minute Firebase Setup

### 1. Create a Firebase Project
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com) and click **Add project**.
2. Name your project (e.g. `vibefling-app`).

### 2. Enable Authentication
1. Go to **Build > Authentication** > **Get started**.
2. In the **Sign-in method** tab, click **Google** and toggle **Enable**.
3. Select your support email and click **Save**.

### 3. Create Firestore Database
1. Go to **Build > Firestore Database** > **Create database**.
2. Select **Start in production mode** (our `firestore.rules` file will provide rules).
3. Choose your database location.

### 4. Enable Cloud Storage
1. Go to **Build > Storage** > **Get started**.
2. Select standard settings. *(New buckets may require the pay-as-you-go Blaze plan; the free tier allowance is generous for friend groups).*

### 5. Register Web App & Add Config
1. Go to **Project settings** (gear icon) > **General** > **Your apps**.
2. Click the Web icon `</>`, name it (e.g. `Vibefling Web`), and register.
3. Copy your `firebaseConfig` keys into [public/firebase-config.js](public/firebase-config.js) or paste them directly in the app's on-screen setup modal:
   ```javascript
   const DEFAULT_FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

---

## 🛠️ Deploy to Firebase Hosting

Run the following commands in the `vibefling` directory:

```bash
# 1. Install Firebase CLI globally (if not already installed)
npm install -g firebase-tools

# 2. Log in to your Google account
firebase login

# 3. Associate your project
firebase use --add

# 4. Deploy rules and hosting
firebase deploy
```

Once deployed, open your live `*.web.app` Hosting URL!

---

## 📱 How Sharing Works

1. Create a **vibe** (group album).
2. Tap **🔗 Invite link**.
3. Share the link in your WhatsApp group.
4. Anyone who taps the link and signs in with their Google account is automatically added to the vibe members list and gains access to all photos, comments, and remixes!

---

## 📊 Data Model & Architecture

### Firestore Collections

- **`users/{uid}`**:
  - `name`: String (from Google profile)
  - `photo`: String (from Google profile)
- **`trips/{tripId}`**:
  - `title`: String
  - `ownerId`: String (UID)
  - `members`: Array of UIDs
  - `createdAt`: Timestamp
- **`trips/{tripId}/photos/{photoId}`**:
  - `by`: String (UID)
  - `at`: Timestamp
  - `kind`: `"image"` | `"video"` | `"text"`
  - `url`: String (Cloud Storage download URL)
  - `path`: String (Cloud Storage storage path)
  - `cap`: String (Upload caption or text note)
  - `top`: String (Top meme text)
  - `bot`: String (Bottom meme text)
  - `filter`: `"f-bw"` | `"f-sepia"` | `"f-pop"` | `"f-fry"` | `""`
  - `sticker`: Emoji string (e.g. `"😂"`, `"🔥"`)
  - `tags`: Array of tagged member UIDs
  - `reactions`: Map of `{ [emoji]: [uid1, uid2, ...] }`
- **`trips/{tripId}/comments/{commentId}`**:
  - `pid`: String (associated photo ID)
  - `by`: String (UID)
  - `at`: Timestamp
  - `text`: String

### Cloud Storage

- Files stored as original uncompressed media under:
  ```
  trips/{tripId}/{uuid}
  ```
