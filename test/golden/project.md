---
title: "Line-follower v1"
track: "Robotics"
exported: 2026-11-03
entries: 5
first_entry: 2026-10-02
last_entry: 2026-10-06
budget_cap_idr: 350000
spent_idr: 65000
success_measure: "Laps without leaving the line (>= 3 laps)"
result: "3 laps (Met)"
skills: [{name: "PID control", level: 2, proofs: 1}]
variant: portfolio
---

# Line-follower v1

## At a glance

My robot leaves the line on every bend.

Result: **3 laps** against "Laps without leaving the line": Met.

Skills: PID control (level 2, 1 proof).

Cost: Rp 65.000.

Dates: 2026-10-02 to 2026-10-06.

## 1. Problem

My robot leaves the line on every bend.

For: Me

Success measure: Laps without leaving the line (>= 3 laps)

## 2. Study

### PID

Feedback control.

```
u = Kp e
```

## 3. Design

### 2026-10-03 ESP32

Which board?

Options considered:

- Arduino Nano
- ESP32

Choice: ESP32. More PWM pins.

> What would change my mind: If Wi-Fi drew too much current.

Models and drawings: chassis.stl (Chassis).

## 4. Plan and order

| Part | Qty | Planned |
| --- | --- | --- |
| ESP32 DevKit | 1 | Rp 65.000 |

Planned Rp 65.000, spent Rp 65.000, against a cap of Rp 350.000.

## 5. Build

2026-10-04. **Overshoot.** Leaves the line. Fix: Kd 0.3.

2026-10-05. **Soldered headers.** Tinned the tip. (Figure 1)

![Figure 1. Headers](assets/fig-01.jpg)

## 6. Test

The measure: Laps without leaving the line (>= 3 laps).

Result: **3 laps**. Met. Three runs on the A3 oval.

## 7. Write-up

### Problem

My robot leaves the line.

I tuned it.

## Appendix A. What broke

| Date | Title | Symptom | Cause | Fix |
| --- | --- | --- | --- | --- |
| 2026-10-04 | Overshoot | Leaves the line. | No damping. | Kd 0.3. |

## Appendix B. Parts

| Date | Part | Qty | Unit price | Shop |
| --- | --- | --- | --- | --- |
| 2026-10-03 | ESP32 DevKit | 1 | Rp 65.000 | Shopee |

## Appendix C. References

- PID primer (article) https://example.com/pid

## Files

- chassis.stl: Chassis

---

Exported 2026-11-03 from 5 dated entries, 2026-10-02 to 2026-10-06. Dates are the days the entries were created in Fuse.
