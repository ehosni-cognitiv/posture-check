# Posture Check

Watches you through the webcam and tells you when you start slouching. Pose
estimation runs locally in the browser with MediaPipe Pose Landmarker — no video
ever leaves the machine.

## Run

```bash
yarn
yarn start
```

Then allow camera access, sit the way you want to sit, and press **Calibrate
good posture**. The app holds that pose as the baseline and compares every
frame against it.

## How it decides posture is bad

Each frame the pose model returns body landmarks. Four numbers are derived from
the nose, ears and shoulders, all normalized by shoulder width so they survive
moving around in the chair:

| Metric | What it catches |
| --- | --- |
| Ear-to-shoulder gap | Head sinking toward the shoulders |
| Shoulder width | Leaning in toward the screen |
| Shoulder slope | Collapsing onto one side |
| Head offset from shoulder center | Head drifting off center |

When any metric strays far enough from the calibrated baseline for the
configured number of seconds, a desktop notification and a chime fire. The
alert repeats at most once a minute while posture stays bad, and re-arms after
three seconds of sitting well again.

Sensitivity scales every threshold: higher is pickier.

## Notes

- Grant notification permission when prompted, otherwise only the on-screen
  badge and chime appear.
- Recalibrate after changing chair, desk or camera position.
