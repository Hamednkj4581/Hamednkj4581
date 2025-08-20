import fs from "fs";
import axios from "axios";

const data: [string, string][] = JSON.parse(fs.readFileSync("data.json", "utf-8"));

// 用于存放能访问的用户数据
const validData: [string, string][] = [];

// 等待指定毫秒数
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 检查用户名页面是否可访问的异步函数
async function checkUser(username: string): Promise<boolean> {
    try {
        const { status } = await axios.get(`https://github.com/${username}`, {
            validateStatus: () => true, // 不抛异常
            timeout: 5000,
        });

        console.log(`https://github.com/${username}`, status);

        if (status != 200 && status != 404)
            process.exit();

        return status === 200;
    } catch (error) {
        return false;
    }
}

async function main() {
    console.log(data.length);

    for (const [username, ...rest] of data) {
        console.log("checkUser", username);

        if (await checkUser(username))
            validData.push([username, ...rest]);

        // 每次请求后等待 1500 毫秒（1.5 秒，可根据实际情况调整）
        await sleep(1500);
    }
    // 将有效数据写回 data.json
    fs.writeFileSync("data.json", JSON.stringify(validData, null, 2), "utf-8");
    console.log("筛选后的有效用户已写回 data.json", validData.length);
}

main();