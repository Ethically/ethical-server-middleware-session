import uid from 'uid-safe'
import memoryStore from './memory.js'

const cookieName = 'session'
const dayMilliseconds = 24 * 60 * 60 * 1000
const defaultMaxAge = dayMilliseconds * 3 // 3 days

const getExpiration = (maxAge, expires)  => {
    if (typeof maxAge === 'number')
        return maxAge
    if (expires instanceof Date)
        return new Date(expires).getTime() - Date.now()
    return defaultMaxAge
}

const getSessionAPI = (sessionID, store, ctx, opts) => ({
    get: (...args) => {
        if (args.length === 0) {
            return Object.freeze(Object.assign({}, store.get(sessionID)))
        }
        const [ key ] = args
        return store.get(sessionID)[key]
    },
    set: (key, value) => {
        const session = store.get(sessionID)
        session[key] = value
        store.set(sessionID, session)
    },
    destroy: (...args) => {
        if (args.length === 0) {
            ctx.session.refresh(true)
            return
        }
        const [ key ] = args
        delete store.get(sessionID)[key]
    },
    refresh: (reset) => {
        const oldSessionObj = store.get(sessionID)
        const sessionObj = (reset ? {} : oldSessionObj)
        const newSessionID = uid.sync(32)
        const newSessionObj = { ...sessionObj, sessionID: newSessionID }
        const { maxAge, expires } = opts
        const expireAge = getExpiration(maxAge, expires)

        store.destroy(sessionID)
        ctx.cookies.set(cookieName, newSessionID, opts)
        store.set(newSessionID, newSessionObj)
        store.expire(newSessionID, expireAge)
        ctx.session = getSessionAPI(newSessionID, store, ctx, opts)
        ctx.session.set('sessionIP', oldSessionObj.sessionIP)
        ctx.session.set('sessionUserAgent', oldSessionObj.sessionUserAgent)
    }
})

const sessionMiddlewareInit = async (ctx, next, opts = {}) => {

    const { store = memoryStore } = opts
    const sessionID = ctx.cookies.get(cookieName) || '__new_session__'
    const sessionOpts = { ...opts, overwrite: true }

    if (store.get(sessionID) === undefined) {
        store.set(sessionID, { sessionID })
    }

    ctx.session = getSessionAPI(sessionID, store, ctx, sessionOpts)

    const ip = ctx.session.get('sessionIP')
    const userAgent = ctx.session.get('sessionUserAgent')
    const requestIP = ctx.request.ip
    const requestUserAgent = ctx.request.headers['user-agent']
    const tampered = (requestIP !== ip || requestUserAgent !== userAgent)

    if (tampered) {
        ctx.session.destroy()
        ctx.session.set('sessionIP', requestIP)
        ctx.session.set('sessionUserAgent', requestUserAgent)
        return await next()
    }

    // Extend cookie life
    // ctx.cookies.set(cookieName, sessionID, sessionOpts)

    await next()
}

const sessionMiddleware = (opts) => (
	async (ctx, next) => (
        await sessionMiddlewareInit(ctx, next, opts)
    )
)

export default sessionMiddleware
