---
"@mattbutlerengineering/rialto": patch
---

ReservationList and TimeSlots catalog descriptions tell a generating model to copy the venue-local `HH:mm` time as is, since the element now writes it in the locale's clock. ReservationList's rows now share one subgrid, so a dated time such as "Fri Oct 16, 7:30 PM" stays on one line and every row stays aligned.
