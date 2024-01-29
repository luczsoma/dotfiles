#!/bin/zsh

# Run this in ~/.ssh

read "target_machine?Target machine: "
read "target_user?Target username: "
read "source_machine?Source machine: "

ssh_key_id=${target_machine}_${target_user}_${source_machine}_$(date "+%Y%m%d")
password=$(pwgen -s 43)

ssh-keygen -t ed25519 -Z chacha20-poly1305@openssh.com -N ${password} -f ${ssh_key_id} -C ${ssh_key_id}

echo "\n1. Add this to ~/.ssh/authorized_keys on the target machine:"
cat ${ssh_key_id}.pub
echo "\n2. Add this to ~/.ssh/config on the local machine:"
echo "Host ${target_machine}"
echo "HostName TARGET_HOSTNAME"
echo "Port TARGET_PORT"
echo "User ${target_user}"
echo "IdentityFile ~/.ssh/${ssh_key_id}"
echo "UseKeychain yes"
echo "\n3. ssh ${target_machine}"
echo "\n4. Use the following password for the key (it is stored in the Keychain on first use): ${password}"
