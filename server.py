# server.py
import socket
import threading

# 服务端配置
HOST = "0.0.0.0"  # 监听所有IP
PORT = 5000  # 监听端口
BUF_SIZE = 1024 * 1024  # 1MB 缓冲区
DATA = b"x" * BUF_SIZE  # 模拟数据（每次发送1MB）

def handle_client(conn, addr):
    print(f"客户端 {addr} 已连接")
    
    # 测试下载速度：不停发送数据
    while True:
        try:
            conn.sendall(DATA)
        except BrokenPipeError:
            print("客户端连接中断，停止发送数据")
            break

    conn.close()

def start_server():
    # 创建socket并绑定
    with socket.socket() as s:
        s.bind((HOST, PORT))
        s.listen(5)  # 设置最大连接数
        print(f"服务端启动，监听 {HOST}:{PORT} ...")

        while True:
            conn, addr = s.accept()
            # 每当有新的客户端连接，启动一个新线程来处理
            client_thread = threading.Thread(target=handle_client, args=(conn, addr))
            client_thread.daemon = True  # 设置为守护线程，主程序退出时线程也会退出
            client_thread.start()

if __name__ == "__main__":
    start_server()
