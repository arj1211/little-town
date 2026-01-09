export class Demographics {
    static assignRole(id) {
        // Simple distribution: 20% Students, 60% Workers, 20% Retirees
        const rand = Math.random();
        if (rand < 0.2) return 'student';
        if (rand < 0.8) return 'worker';
        return 'retiree';
    }

    static createSchedule(role) {
        // define simple daily routines
        const schedule = [];

        if (role === 'student') {
            // School: 8am - 3pm
            schedule.push({ time: 8, activity: 'school', location: 'school', duration: 7 });
            // Home/Play: 3pm onwards
            schedule.push({ time: 15, activity: 'playing', location: 'park', duration: 2 });
            schedule.push({ time: 17, activity: 'home', location: 'home', duration: 15 }); // until next day 8am
        } else if (role === 'worker') {
            // Work: 9am - 5pm
            schedule.push({ time: 9, activity: 'work', location: 'workplace', duration: 8 });
            // Shop/Relax: 5pm - 7pm
            if (Math.random() < 0.5) {
                schedule.push({ time: 17, activity: 'shopping', location: 'commercial', duration: 2 });
                schedule.push({ time: 19, activity: 'home', location: 'home', duration: 14 });
            } else {
                schedule.push({ time: 17, activity: 'home', location: 'home', duration: 16 });
            }
        } else {
            // Retiree: erratic
            schedule.push({ time: 10, activity: 'walk', location: 'park', duration: 2 });
            schedule.push({ time: 12, activity: 'lunch', location: 'commercial', duration: 2 });
            schedule.push({ time: 14, activity: 'home', location: 'home', duration: 20 });
        }

        return schedule;
    }
}
