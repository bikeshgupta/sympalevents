// The rules live in shared/ so the API can classify an event (upcoming, live,
// completed) with exactly the same function the screens use. This file keeps
// every existing `@/lib/event-status` import working.
export * from "../../shared/event-status";
