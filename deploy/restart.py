import sys
import os
import time

start_time = time.time()

os.system("python3 kill_games.py && docker-compose down plaza && docker-compose up -d plaza && python3 launch_games.py")

end_time = time.time()
print(f"代码运行时间: {end_time - start_time:.2f} 秒")
