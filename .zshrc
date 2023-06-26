##################################################
# ALIASES
##################################################

# Make ls better
# -F displays: / directory, * exec, @ symlink, = socket, % whiteout, | FIFO
# -G enables colorized output
# -h human readable output for sizes
export CLICOLOR=1
export LSCOLORS=GxFxBxDxCxegedabageced
alias ls="ls -FGh"

# Make mv ask before overwriting a file by default
alias mv="mv -i"

# Fast IP query
alias ip="curl ifconfig.co"

# Shortcut for download mp3 from youtube
alias yt2mp3="youtube-dl -x --audio-format mp3 --audio-quality 0"

##################################################
# HELPERS
##################################################

# Set JDK version
function jdk() {
    if [[ $# -eq 0 ]]; then
        /usr/libexec/java_home -V
    elif [[ $# -eq 1 ]]; then
        version=$1
        export JAVA_HOME=$(/usr/libexec/java_home -v "$version")
        java -version
    fi
}

# Handling personal vault
function vault() {
    USAGE_MESSAGE="Usage:\nvault o|open\nvault s|save-and-delete\nvault d|delete\n"

    if [[ $# -ne 1 ]]
    then
        printf "$USAGE_MESSAGE"
        return 1
    fi

    case $1 in
    o | open)
        pushd ~/Desktop
        if [[ ! -d Vault ]]
        then
            age --decrypt --output Vault.zip ~/Vault/vault &&
            unzip -q Vault.zip &&
            open Vault
        fi
        rm -f Vault.zip
        popd
        ;;
    s | save-and-delete)
        pushd ~/Desktop
        if [[ -d Vault ]]
        then
            zip --quiet --recurse-paths Vault.zip Vault &&
            age --encrypt --passphrase --output ~/Vault/vault Vault.zip &&
            rm -r Vault
        fi
        rm -f Vault.zip
        popd
        ;;
    d | delete)
        pushd ~/Desktop
        read -k 1 "?Delete Vault without saving changes? (y/Y) "
        echo
        if [[ "$REPLY" =~ ^[Yy]$ ]]
        then
            rm -rf Vault
            printf "The Vault has been deleted without changes being saved."
        fi
        popd
        ;;
    *)
        printf "$USAGE_MESSAGE"
        ;;
    esac
}

# Converting movies to tv
function tvconvert() {
    node ~/.dotfiles/tvconvert.mjs "$@"
}

# Converting images
function oraallas() {
    USAGE_MESSAGE="Usage: oraallas IN_FOLDER\n"
    if [[ $# -ne 1 ]]
    then
        printf "$USAGE_MESSAGE"
        return 1
    fi 
    
    find $1 -iname "*.HEIC" -exec sips --setProperty format jpeg --resampleWidth 1200 {} --out "{}.jpg" \; -exec rm {} \;
}

# YNAB CSV converter
function ynabcsv() {
	python3 ~/.dotfiles/ynab-csv-converter.py $1
}

##################################################
# SETTING STUFF
##################################################

# Add Visual Studio Code (code)
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# OpenSSL 1.1 instead of the OS default LibreSSL
export PATH="/usr/local/opt/openssl@1.1/bin:$PATH"

# Loading NVM and its bash complation
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Homebrew
if [[ $(uname -p) == "arm" ]]
then
    # bp1-mobosx-4188
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    # Hermes
    eval "$(/usr/local/Homebrew/bin/brew shellenv)"
fi

# Rust (Cargo)
. "$HOME/.cargo/env"
