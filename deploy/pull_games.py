import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

start_time = time.time()

if len(sys.argv) > 1:
    games = [sys.argv[1]]
else:
    games = [
        # "dahuaxiyou", "jinpingmei3", "jiuxianlawang", "shuihuzhuan", "yinheshuiguoji", "3dabaigujing", "biluchuanshuo", "tiaogaogao", 
        "danaotiangong", "danaotiangong2", "jinchanbuyu", "likuipiyu", "xunlongduobao",
        "errenniuniu", "huanle5zhang", "qiangzhuangniuniu", "tongbiniuniu", "21dian", "yingsanzhang",
        "bairenniuniu", "benchibaoma", "caishuzi", "feiqinzoushou", "huanle30miao", "longhudou", "yaoyiyao",
    ]

def execute_command(command):
    print(command)
    os.system(command)

dir_name = os.path.basename(os.getcwd())

with ThreadPoolExecutor() as executor:
    futures = []
    
    for game in games:
        image = f"oby90060/{game}"
        
        pull_command = f"docker pull {image}"
        futures.append(executor.submit(execute_command, pull_command))

    for future in as_completed(futures):
        future.result()  # 等待每个任务完成

end_time = time.time()
print(f"代码运行时间: {end_time - start_time:.2f} 秒")
