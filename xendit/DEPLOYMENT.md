# 🚢 Deployment Guide

Complete guide for deploying your GHL Xendit Payment Gateway to production.

## 📋 Pre-Deployment Checklist

- [ ] MongoDB database ready (Atlas or self-hosted)
- [ ] Domain with SSL certificate
- [ ] Xendit production account verified
- [ ] GHL marketplace app created
- [ ] Environment variables configured
- [ ] Security keys generated (strong, unique)
- [ ] Backup strategy in place
- [ ] Monitoring tools configured

## 🎯 Deployment Options

### Option 1: Railway (Recommended - Easiest)

**Why Railway?**
- Automatic SSL
- Built-in MongoDB
- One-click deploy
- Free tier available

**Steps:**

1. **Install Railway CLI**
```bash
npm install -g @railway/cli
```

2. **Login**
```bash
railway login
```

3. **Initialize Project**
```bash
railway init
```

4. **Add MongoDB**
```bash
railway add mongodb
```

5. **Set Environment Variables**
```bash
railway variables set ENCRYPTION_KEY="your_key"
railway variables set JWT_SECRET="your_secret"
railway variables set GHL_CLIENT_ID="69035bb47ddd385551737f5c-mhdeym94"
railway variables set GHL_CLIENT_SECRET="add8201c-d369-49d3-8bb1-1d7a539ecdcf"
# ... add all variables
```

6. **Deploy**
```bash
railway up
```

7. **Get URL**
```bash
railway domain
```

✅ **Done!** Your app is live at `https://your-app.railway.app`

---

### Option 2: Heroku

**Steps:**

1. **Install Heroku CLI**
```bash
npm install -g heroku
```

2. **Login**
```bash
heroku login
```

3. **Create App**
```bash
heroku create ghl-xendit-app
```

4. **Add MongoDB**
```bash
heroku addons:create mongodb:small
```

5. **Set Config Vars**
```bash
heroku config:set ENCRYPTION_KEY="your_key"
heroku config:set JWT_SECRET="your_secret"
heroku config:set GHL_CLIENT_ID="69035bb47ddd385551737f5c-mhdeym94"
heroku config:set GHL_CLIENT_SECRET="add8201c-d369-49d3-8bb1-1d7a539ecdcf"
# ... add all variables
```

6. **Create Procfile**
```
web: node src/server.js
```

7. **Deploy**
```bash
git push heroku main
```

8. **Open App**
```bash
heroku open
```

---

### Option 3: DigitalOcean (Most Control)

**Requirements:**
- DigitalOcean account
- Ubuntu 20.04+ droplet
- Domain pointed to droplet

**Steps:**

1. **SSH into Droplet**
```bash
ssh root@your-droplet-ip
```

2. **Install Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Install MongoDB**
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

4. **Clone Repository**
```bash
cd /var/www
git clone https://github.com/youruser/ghl-xendit-app.git
cd ghl-xendit-app
```

5. **Install Dependencies**
```bash
npm install --production
```

6. **Configure Environment**
```bash
nano .env
# Paste all environment variables
```

7. **Install PM2**
```bash
sudo npm install -g pm2
```

8. **Start Application**
```bash
pm2 start src/server.js --name ghl-xendit
pm2 save
pm2 startup
```

9. **Setup Nginx**
```bash
sudo apt-get install nginx
sudo nano /etc/nginx/sites-available/ghl-xendit
```

Add configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

10. **Enable Site**
```bash
sudo ln -s /etc/nginx/sites-available/ghl-xendit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

11. **Setup SSL with Let's Encrypt**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

✅ **Done!** Your app is live at `https://your-domain.com`

---

### Option 4: AWS EC2

**Steps:**

1. **Launch EC2 Instance**
   - AMI: Ubuntu 20.04
   - Instance type: t3.small or larger
   - Security group: Allow HTTP(80), HTTPS(443), SSH(22)

2. **Connect to Instance**
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

3. **Follow DigitalOcean steps 2-11** (same process)

4. **Configure Auto-scaling** (optional)
   - Create AMI from instance
   - Setup Auto Scaling Group
   - Configure Load Balancer

---

## 🔒 Security Hardening

### 1. Environment Variables

**Never commit `.env`!**

```bash
# Add to .gitignore
echo ".env" >> .gitignore
```

### 2. Firewall Setup

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. MongoDB Security

```bash
# Create admin user
mongo
use admin
db.createUser({
  user: "admin",
  pwd: "strong_password",
  roles: ["userAdminAnyDatabase"]
})

# Enable authentication
sudo nano /etc/mongod.conf
# Add:
security:
  authorization: enabled
```

### 4. Nginx Rate Limiting

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    location /api {
        limit_req zone=api burst=20;
    }
}
```

### 5. SSL/TLS Configuration

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
add_header Strict-Transport-Security "max-age=31536000" always;
```

---

## 📊 Monitoring

### 1. Setup PM2 Monitoring

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Monitor
pm2 monit
```

### 2. MongoDB Monitoring

```bash
# Enable monitoring
sudo systemctl enable mongod
mongotop
mongostat
```

### 3. Application Logs

```bash
# View logs
pm2 logs ghl-xendit

# Tail logs
tail -f logs/combined.log
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd /var/www/ghl-xendit-app
          git pull
          npm install --production
          pm2 restart ghl-xendit
```

---

## 🔧 Maintenance

### Backup MongoDB

```bash
# Create backup script
nano /usr/local/bin/backup-mongo.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --out /backups/mongo_$DATE
# Upload to S3 or similar
```

```bash
chmod +x /usr/local/bin/backup-mongo.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /usr/local/bin/backup-mongo.sh
```

### Update Application

```bash
cd /var/www/ghl-xendit-app
git pull
npm install --production
pm2 restart ghl-xendit
```

---

## 🚨 Troubleshooting

### Server won't start
```bash
# Check logs
pm2 logs ghl-xendit

# Check port
netstat -tlnp | grep 3000

# Check MongoDB
sudo systemctl status mongod
```

### High memory usage
```bash
# Check processes
pm2 monit

# Restart if needed
pm2 restart ghl-xendit
```

### Database connection issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check connection
mongo --eval "db.adminCommand('ping')"

# Restart if needed
sudo systemctl restart mongod
```

---

## ✅ Post-Deployment

1. **Test all endpoints**
2. **Configure webhooks in Xendit**
3. **Update GHL app settings**
4. **Monitor logs for 24 hours**
5. **Setup backup schedule**
6. **Configure monitoring alerts**

---

## 🎉 You're Live!

Your GHL Xendit Payment Gateway is now running in production!

**Next Steps:**
- Submit to GHL Marketplace
- Start accepting real payments
- Monitor performance
- Scale as needed

Need help? Contact support@yourcompany.com

