echo "codespace:mynewpassword" | sudo chpasswd
docker run -d -p 1234:1234 --restart=always alpine/socat TCP-LISTEN:1234,fork TCP:172.17.0.1:2222
docker run -d --name frpc -v ./frpc.toml:/etc/frp/frpc.toml snowdreamtech/frpc

docker-compose up -d && python3 launch_games.py

# docker logs -f frpc
