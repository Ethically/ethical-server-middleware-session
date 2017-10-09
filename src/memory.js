const storage = {}
const memoryStore = {
    get: key => {
        return storage[key]
    },
    set: (key, value) => {
        storage[key] = value
    },
    destroy: key => {
        delete storage[key]
    },
    expire: (key, age) => {
        setTimeout(() => memoryStore.destroy(key), age)
    }
}

export default memoryStore
