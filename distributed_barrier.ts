import * as zookeeper from 'node-zookeeper-client';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = await yargs(hideBin(process.argv))
    .option('zk', {
        alias: 'zookeeper',
        type: 'string',
        description: 'Zookeeper 连接串',
        default: '70.36.96.27:2181',
        demandOption: false,
    })
    .option('path', {
        alias: 'barrierPath',
        type: 'string',
        description: '屏障节点路径',
        default: '/barrier',
        demandOption: false,
    })
    .option('count', {
        alias: 'participantCount',
        type: 'number',
        description: '需要同步的进程数量',
        default: 50,
        demandOption: false,
    })
    .help()
    .argv;

const zkConnectionString = argv.zk;
const barrierPath = argv.path;
const participantCount = argv.count;

const client = zookeeper.createClient(zkConnectionString);

process.on('SIGINT', async () => {
    // Ctrl+C
    console.log('SIGINT: 用户中断');
    client.close();
    process.exit();
});

process.on('SIGTERM', async () => {
    // timeout docker-compose down/stop 会触发 SIGTERM 信号
    console.log('SIGTERM: 终止请求');
    client.close();
    process.exit();
});

function enterBarrier(client: zookeeper.Client, barrierPath: string, participantCount: number): Promise<void> {
    return new Promise((resolve, reject) => {
        // 创建屏障父节点（如不存在）
        client.mkdirp(barrierPath, (err) => {
            if (err) return reject(err);

            // 每个参与者创建自己的临时子节点
            const nodePath = `${barrierPath}/participant-`;

            client.create(
                nodePath,
                null,
                zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL,
                (err, createdPath) => {
                    if (err) return reject(err);

                    // 监听子节点数变化
                    function checkBarrier() {
                        client.getChildren(
                            barrierPath,
                            (event) => {
                                // 节点变更时再次检查
                                checkBarrier();
                            },
                            (err, children) => {
                                if (err) return reject(err);
                                if (children.length >= participantCount) {
                                    console.log('屏障已通过！所有参与者已就绪。');
                                    resolve();
                                } else {
                                    console.log(`等待中，当前已就绪: ${children.length} / ${participantCount}`);
                                    // 等待 watch 触发
                                }
                            }
                        );
                    }

                    checkBarrier();
                }
            );
        });
    });
}

client.once('connected', async () => {
    try {
        await enterBarrier(client, barrierPath, participantCount);
        console.log('屏障已通过，等待所有参与者检测到屏障...');

        setTimeout(() => {
            console.log('安全退出');
            client.close();
            process.exit();
        }, 1000);
    } catch (e) {
        console.error('屏障出错:', e);
        client.close();
        process.exit(1);
    }
});

client.connect();