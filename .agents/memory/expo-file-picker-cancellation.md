---
name: Expo file-picker cancellation
description: Keep phone-browser upload controls interactive when Expo's document picker is dismissed.
---

Do not lock the screen or show upload-busy state while awaiting Expo document selection. Lock only during actual file processing.

**Why:** The installed Expo web picker does not return its cancellation event. Dismissing the picker left its promise pending, which froze authorization and upload controls when they depended on picker busy state.

**How to apply:** Handle successful selections and native cancellation normally, but keep web controls usable while selection is pending. Verify dismissing and reopening the picker, and recheck the installed SDK before assuming browser cancellation resolves the promise.