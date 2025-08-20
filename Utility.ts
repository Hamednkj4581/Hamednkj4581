import fs from 'fs';
import logger from "./logger.js";

export default class Utility {
    static async waitForSeconds(delay: number) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(null);
            }, Math.min(delay * 1000, Math.pow(2, 31) - 1));
        });
    }

    /**
     * Node 端实现的 waitForFunction，用于轮询等待某个异步条件成立
     * @param conditionFn - 返回你需要的值，不满足时返回 null/undefined
     * @param options - 轮询间隔和超时时间
     * @returns Promise<any>
     */
    static async waitForFunction<T>(
        conditionFn: () => Promise<T | null | undefined>,
        options: { pollInterval?: number; timeout?: number } = {}
    ): Promise<T> {
        const { pollInterval = 300, timeout = 300_000 } = options;
        const start = Date.now();

        while (true) {
            const result = await conditionFn();
            if (result !== null && result !== undefined)
                return result;

            if (Date.now() - start > timeout)
                throw new Error('waitForFunction timeout');

            await this.waitForSeconds(pollInterval / 1000);
        }
    }

    static appendStepSummary(data: string, logFunc: (_: string) => void = logger.info) {
        const { GITHUB_STEP_SUMMARY } = process.env;
        data = typeof data == "string" ? data : JSON.stringify(data, null, 4);
        GITHUB_STEP_SUMMARY && fs.appendFileSync(GITHUB_STEP_SUMMARY, data + "\n");
        logFunc(data);
    }
}