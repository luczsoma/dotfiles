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

# Converting images
function oraallas() {
    USAGE_MESSAGE="Usage: oraallas IN_FOLDER\n"
    if [[ $# -ne 1 ]]; then
        printf "$USAGE_MESSAGE"
        return 1
    fi 
    
    find -E $1 -regex ".+\.(heic|jpe?g|HEIC|JPE?G)" -exec sips --setProperty format jpeg --resampleWidth 1200 {} --out "{}.jpg" \; -exec rm {} \;
}

# YNAB converter
function ynab() {
    ~/git/ynab-converter/venv/bin/python ~/git/ynab-converter/ynab-converter.py $1
}

##################################################
# SETTING STUFF
##################################################

# Add Visual Studio Code (code)
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# Loading NVM and its bash complation
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Homebrew
if [[ $(uname -p) == "arm" ]]; then
    # bp1-mobosx-4188
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    # Hermes
    eval "$(/usr/local/Homebrew/bin/brew shellenv)"
fi

# Rust (Cargo)
. "$HOME/.cargo/env"

# Emscripten SDK
export EMSDK_QUIET=1
. "$HOME/git/emsdk/emsdk_env.sh"
