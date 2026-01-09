export class TimeManager {
  constructor() {
    this.time = 8; // Start at 8:00 AM
    this.timeScale = 300; // 1 real second = 5 minute in-game (fast day/night cycle)
  }

  update(deltaTime) {
    // Update time (deltaTime is in seconds)
    this.time += (deltaTime * this.timeScale) / 3600; // Convert to hours

    // Wrap around at 24 hours
    if (this.time >= 24) {
      this.time %= 24;
    }
  }

  getTimeOfDay() {
    return this.time;
  }

  getTimeString() {
    const hours = Math.floor(this.time);
    const minutes = Math.floor((this.time - hours) * 60);
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    return `${hoursStr}:${minutesStr}`;
  }

  isDaytime() {
    // Day is from 6:00 to 20:00 (6 AM to 8 PM)
    return this.time >= 6 && this.time < 20;
  }

  isWorkHours() {
    // Work hours: 8:00 to 17:00 (8 AM to 5 PM)
    return this.time >= 8 && this.time < 17;
  }

  isSchoolHours() {
    // School hours: 8:00 to 15:00 (8 AM to 3 PM)
    return this.time >= 8 && this.time < 15;
  }

  isLateNight() {
    // Late night: 20:00 to 23:00 (8 PM to 11 PM)
    return this.time >= 20 && this.time < 23;
  }

  isNightSleep() {
    // Sleep time: 23:00 to 6:00
    return this.time >= 23 || this.time < 6;
  }
}
