/**
 * LogService
 * @class
 * @classdesc LogService class. Log to console and to simple string array. Distinguish between log levels (log and error).
 * @export LogService
 * 
 */


class LogS {

    public static logs: string[] = [];
    private static MAX_LOG_MSGS = 250;
    
    /**
     * @param level 0 -> log, 1 -> error
     * @param message Message to log
     */
    public static log(level: number, message: string): void {
        if (level < 0 || level > 1) {
            throw new Error('Invalid log level');
        }
        // get the actual time
        const d = new Date();
        const time_str = d.toLocaleTimeString();
        // Keep every log entry on ONE line: message text may carry real CR/LF
        // (own or received messages). Escape them to visible \r / \n so a
        // multi-line message can't break the log view into several entries.
        const safe_message = message.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        const msg_str = time_str + " - " + safe_message;

        if (level === 0) {
            console.log(msg_str);
        } else {
            console.error(msg_str);
        }
        this.logs.unshift(msg_str);

        this.checkLogSize();
    }

    /**
     * clear logs
     * @returns void
     */
    public static clearLogs(): void {
        this.logs = [];
    }

    /**
     * delete the oldest log messages if the log size exceeds the limit
     * @param limit Log size limit
     * @returns void
     */
    private static checkLogSize(): void {
        if (this.logs.length > this.MAX_LOG_MSGS) {
            this.logs.splice(0, this.logs.length - this.MAX_LOG_MSGS);
        }
    }

}

export default LogS;