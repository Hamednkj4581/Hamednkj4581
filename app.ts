import './loadEnv.js';
import './patches.js';
import Utility from "./Utility.js";
import os from 'os';
import puppeteer, { ElementHandle, Page } from 'puppeteer';
import logger from './logger.js';
import { authenticator } from 'otplib';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

(async () => {
    const { GITHUB_USERNAME, GITHUB_PASSWORD, GITHUB_SECRET, DELETE_REPO, UPDATE_REPO, REMOTE, STRESS_TEST, Stop_All_PIPELINES } = process.env;

    if (!GITHUB_USERNAME || !GITHUB_PASSWORD || !GITHUB_SECRET) {
        logger.error("环境变量未配置");
        return;
    }

    const MAX_TIMEOUT = Math.pow(2, 31) - 1;
    const headless = os.platform() == 'linux';

    const browser = await puppeteer.launch({
        headless,
        defaultViewport: null,//自适应
        protocolTimeout: MAX_TIMEOUT,
        slowMo: 10,
        args: [
            '--lang=en-US',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
            // headless 模式下，Puppeteer 的默认 User-Agent 会包含 "HeadlessChrome" 字样，容易被识别为机器人。
            // '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions-file-access-check',
            '--disable-extensions-http-throttling'
        ]
    });

    logger.info(browser.process().spawnfile, await browser.version(), browser.wsEndpoint());

    async function createGithubIssueWithScreenshot(page: Page) {
        if (os.platform() != 'linux')
            return;

        const issuePage = await page.browser().newPage();

        const path = `${Date.now()}.png` as `${string}.png`;
        await page.screenshot({ path });

        const newIssueUrl = "https://github.com/mirllan2025/mirllan2025/issues/new";
        await issuePage.goto(newIssueUrl);
        await issuePage.type("//input[@placeholder='Title']", new Date().toString());
        const input = await issuePage.$x("//input[@type='file']", { visible: false }) as ElementHandle<HTMLInputElement>;
        await input.uploadFile(path);

        const imageUrl = await Utility.waitForFunction(async () => {
            const text = await issuePage.textContent("//textarea[@placeholder='Type your description here…']");
            const match = text.match(/https:\/\/github\.com\/user-attachments\/assets\/[a-zA-Z0-9\-]+/);
            if (match)
                return match[0];
        });

        await issuePage.click("//button[@data-testid='create-issue-button' and .//span[text()='Create']]");
        await issuePage.waitForNavigation();
        await issuePage.close();

        await page.bringToFront();

        Utility.appendStepSummary(`![图片](${imageUrl})\n`);

        fs.unlinkSync(path);
    }

    process.on('SIGTERM', async () => {
        // docker-compose down/stop 会触发 SIGTERM 信号
        logger.info('SIGTERM: 终止请求');
        process.exit();
    });

    process.on("uncaughtException", (e: Error) => {
        logger.error("未捕获的异常", e);
    });

    process.on("unhandledRejection", async (e: Error) => {
        logger.error("未处理的拒绝", e);

        const pages = await browser.pages();
        for (const page of pages) {
            Utility.appendStepSummary(page.url());
            await createGithubIssueWithScreenshot(page);
        }

        process.exit(1);
    });

    const [page] = await browser.pages();
    await page.goto("https://github.com/login");

    await page.type("//input[@id='login_field']", GITHUB_USERNAME);
    await page.type("//input[@id='password']", GITHUB_PASSWORD);
    await page.click("//input[@value='Sign in']");
    await page.waitForNavigation();

    if (page.url().endsWith("suspended")) {
        logger.error("账号异常，无法登录");
        process.exit(1);
    }

    await page.type("//input[@id='app_totp']", authenticator.generate(GITHUB_SECRET));

    await page.click("//button[@aria-label='Open user navigation menu']");
    logger.info("登录成功");

    const username = GITHUB_USERNAME;

    const repoName = username;
    const branch = "master";
    const forkUrl = "https://github.com/mirllan2025/express";

    async function updateFile(source: string, target: string = source) {
        if (!fs.existsSync(source)) {
            logger.error(source, "不存在");
            return;
        }

        source != target && fs.renameSync(source, target);

        const page = await browser.newPage();

        await page.goto(`https://github.com/${username}/${repoName}/upload/${branch}/${path.dirname(target)}`);
        const input = await page.waitForSelector('//*[@id="upload-manifest-files-input"]') as ElementHandle<HTMLInputElement>;
        await input.uploadFile(target);
        logger.info("正在上传");
        await page.waitForSelector("//div[contains(@class, 'js-upload-progress')]");
        await page.waitForSelector("//div[contains(@class, 'js-upload-progress')]", { timeout: 60_000, hidden: true });
        await page.click("//button[normalize-space(text())='Commit changes']");
        await page.waitForNavigation();
        await page.close();
        logger.info(`上传成功 ${source} => ${target}`);

        source != target && fs.renameSync(target, source);
    }

    if (DELETE_REPO && await page.goto(`https://github.com/${username}/${repoName}/settings`, { retries: 1 })) {
        await page.click("//button[@id='dialog-show-repo-delete-menu-dialog']");
        await page.click("//button[@id='repo-delete-proceed-button']");
        await page.click("//button[@id='repo-delete-proceed-button']");
        const confirmText = await page.textContent("//label[@for='verification_field']");
        const match = confirmText.match(/["']([^"']+)["']/);
        await page.type("//input[@id='verification_field']", match[1]);
        await page.click("//button[@id='repo-delete-proceed-button' and not(@disabled)]");
        await page.waitForNavigation();
    }

    if (!await page.goto(`https://github.com/${username}/${repoName}/settings`, { retries: 1 })) {
        await page.goto(forkUrl);
        await page.click("//a[@id='fork-button']");
        await page.type("//input[@id='repository-name-input']", repoName);
        await page.waitForSelector("//span[@id='RepoNameInput-is-available']");
        await page.click("//button[.//span[contains(text(),'Create fork')]]");

        await page.waitForNavigation();

        if (page.url() == forkUrl) {
            logger.error("账号异常，无法fork");
            process.exit(1);
        }

        // const url = `https://github.com/${username}/${repoName}/tree/${branch}/.github/workflows`;
        // await page.goto(url);

        // const items = await page.$$("//li[@id='.github/workflows-item']//ul/li//span[1]/span");
        // const workflows = await Promise.all(items.map(async el => await el.evaluate(el => el.textContent)));
        // for (const workflow of workflows) {
        //     logger.info(`删除工作流文件 ${workflow}...`);
        //     await page.goto(`${url}/${workflow}`);
        //     await page.click("//button[@data-testid='more-file-actions-button-nav-menu-wide']");
        //     await Utility.waitForSeconds(1);
        //     await page.click("//a[span[contains(., 'Delete file')]]");
        //     await page.click("//button[.//span[text()='Commit changes...']]");
        //     await page.click("//button[.//span[text()='Commit changes']]");
        //     await page.waitForNavigation();
        // }

        while (true) {
            await page.goto(`https://github.com/${username}/${repoName}/actions`);
            const elementHandle = await page.$x("//input[@value='I understand my workflows, go ahead and enable them'] | //h3[text()='There are no workflow runs yet.']");
            if (!elementHandle)
                continue;

            const tagName = await elementHandle.evaluate(el => el.tagName);
            tagName == 'INPUT' && await elementHandle.click();
            await page.waitForSelector("//h3[text()='There are no workflow runs yet.']");
            break;
        }

        // await updateFile("concurrency.yml", ".github/workflows/ci.yml");
        // await updateFile("frpc.exe");
    }

    UPDATE_REPO && await updateFile("concurrency.yml", ".github/workflows/ci.yml");

    // await updateFile("concurrency.yml", ".github/workflows/ci.yml");

    // #region circleciPage
    if (REMOTE || STRESS_TEST || Stop_All_PIPELINES) {
        // REMOTE && await updateFile(".circleci/config.yml");
        // STRESS_TEST && await updateFile(".circleci/job-sync.yml", ".circleci/config.yml");

        const circleciPage = await browser.newPage();
        await circleciPage.goto("https://circleci.com/vcs-authorize");
        await (await circleciPage.$x("//a[contains(text(), 'Allow all cookies')]", { timeout: 0 }))?.click();
        await circleciPage.click("//a[contains(text(), 'Log in with GitHub')]");
        await circleciPage.waitForNavigation();

        const authorizeFrame = await circleciPage.waitForFrame(frame => frame.url().startsWith("https://github.com/login/oauth/authorize"), { timeout: 3_000 });
        if (authorizeFrame) {
            logger.info("跳转授权页");
            await Utility.waitForSeconds(3);
            const reauthorization = await authorizeFrame.$("//h1[contains(text(),'Reauthorization required')]");
            await authorizeFrame.click("//button[contains(text(), 'Authorize circleci')]");
            await circleciPage.waitForNavigation();
            logger.info("授权成功");

            if (!reauthorization) {
                logger.info("首次授权");

                if (await circleciPage.$x("//h3[contains(text(), 'Welcome to CircleCI!')]", { timeout: MAX_TIMEOUT })) {
                    const selects = await circleciPage.$$("//span[contains(text(), 'Select...')]");

                    for (const select of selects) {
                        await select.click();
                        await circleciPage.click("//div[@data-testid='dropdown-menu']//div[not(*)][1]");
                    }
                }

                await circleciPage.click("//button[contains(., \"Let's Go\") and not(@disabled)]");
                logger.info("Let's Go");
            }
            else {
                updateFile(".circleci/config.yml");
            }
        }
        else {
            updateFile(".circleci/config.yml");
        }

        await circleciPage.waitForNetworkIdle();

        if (circleciPage.url() != "https://app.circleci.com/home") {
            logger.error("页面跳转异常", circleciPage.url());

            const alert = await circleciPage.textContent("//div[@role='alert']");
            Utility.appendStepSummary(alert, logger.error);
            Utility.appendStepSummary((await axios.get("http://ipinfo.io")).data);

            process.exit(1);
        }

        await circleciPage.goto(`https://app.circleci.com/pipelines/github/${username}`);
        logger.info("页面加载完成");
        await circleciPage.waitForNetworkIdle();

        const addProjectButton = await circleciPage.$("//a[text()='Add Project']");
        if (addProjectButton) {
            logger.info("设置项目");
            await addProjectButton.click();
            await circleciPage.waitForNavigation();
            await circleciPage.waitForNetworkIdle();
            await circleciPage.click("//button[@data-cy='project-button' and text()='Set up']");
            await circleciPage.type("//input[@type='search' and not(@placeholder)]", branch);
            await circleciPage.click("//button[text()='Set Up Project' and not(@disabled)]");
            await circleciPage.waitForNavigation();
        }

        await createGithubIssueWithScreenshot(circleciPage);

        if (Stop_All_PIPELINES) {
            logger.info("停止所有");
            // await Utility.waitForSeconds(5);
            await circleciPage.waitForSelector("//button[@aria-label='Cancel workflow']");
            const buttons = await circleciPage.$$("//button[@class='css-1lbs82y' and @aria-label='Cancel workflow']");
            logger.info("可取消工作流数量", buttons.length / 2);
            for (let i = 1; i < buttons.length; i += 2) {
                await buttons[i].click();
            }
            logger.info("已全部停止");
        }
    }
    // #endregion

    if (os.platform() == 'linux')
        await browser.close();

    logger.info("完成");
})();