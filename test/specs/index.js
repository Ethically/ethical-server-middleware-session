import ethicalServer from 'ethical-utility-server'
import Browser from 'zombie'
import memoryStore from  '../../src/memory.js'
import sessionMiddleware from '../../src/index.js'

const localhost = 'http://localhost:8080'

const removeServer = destroyServer => {
    return destroyServer()
}

const request = ({
    visits = () => {},
    middleware = (ctx, next) => next(),
    opts
}) => (
    ethicalServer()
    .use((ctx, next) => next())
    .use(sessionMiddleware(opts))
    .use(middleware)
    .listen()
    .then(destroyServer => {
        const browser = new Browser()
        return new Promise(async resolve => {
            await visits(browser)
            resolve(destroyServer)
        })
    })
    .then(removeServer)
    .catch(e => console.error(e.stack || e))
)

describe('sessionMiddleware()', () => {
    it('should create a session', (done) => {
        let sessionID
        const middleware = (ctx, next) => {
            expect(ctx.session.set).toEqual(jasmine.any(Function))
            expect(ctx.session.get).toEqual(jasmine.any(Function))
            expect(ctx.session.destroy).toEqual(jasmine.any(Function))
            expect(ctx.session.refresh).toEqual(jasmine.any(Function))
            expect(ctx.session.get('sessionIP')).toEqual(jasmine.any(String))
            expect(ctx.session.get('sessionUserAgent'))
            .toEqual(jasmine.any(String))
            sessionID = ctx.session.get('sessionID')
		}
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, () => {
                    const cookieSessionID = browser.getCookie('session')
                    expect(sessionID.length).toBeGreaterThan(31)
                    expect(sessionID).toBe(cookieSessionID)
                    resolve()
                })
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should output a copy of the session object', (done) => {
        const middleware = (ctx, next) => {
            ctx.session.set('hello', 'world')
            ctx.session.set('hey', 'there')
            ctx.session.set('hi', 'much')
            const session = ctx.session.get()
            expect(session).toEqual(jasmine.objectContaining({
                hello: 'world',
                hey: 'there',
                hi: 'much'
            }))
            expect(() => session.hello = 'there').toThrow()
            expect(() => session.newKey = 'value').toThrow()
        }
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, resolve)
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should remember the session through multiple requests', (done) => {
        let requests = 1
        const middleware = (ctx, next) => {
            if (requests === 1) {
                ctx.session.set('hello', 'world')
                ctx.session.set('hey', 'there')
                ctx.session.set('hi', 'much')
            }
            if (requests === 2) {
                expect(ctx.session.get('hello')).toBe('world')
                expect(ctx.session.get('hey')).toBe('there')
                expect(ctx.session.get('hi')).toBe('much')
                expect(ctx.session.get()).toEqual(jasmine.objectContaining({
                    hello: 'world',
                    hey: 'there',
                    hi: 'much'
                }))
            }
            requests++
            next()
        }
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, () => {
                    browser.visit(localhost, resolve)
                })
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should destroy the session key', (done) => {
        const middleware = (ctx, next) => {
            ctx.session.set('hello', 'world')
            ctx.session.destroy('hello')
            expect(ctx.session.get('hello')).toBeUndefined()
        }
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, resolve)
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should destroy the session', (done) => {
        const middleware = (ctx, next) => {
            const originalSessionID = ctx.session.get('sessionID')
            ctx.session.set('hello', 'world')
            ctx.session.set('hey', 'there')
            ctx.session.set('hi', 'much')
            ctx.session.destroy()
            const hello = ctx.session.get('hello')
            expect(ctx.session.get('hello')).toBeUndefined()
            expect(ctx.session.get('hey')).toBeUndefined()
            expect(ctx.session.get('hi')).toBeUndefined()
            expect(ctx.session.get()).not.toEqual(jasmine.objectContaining({
                hello: 'world',
                hey: 'there',
                hi: 'much'
            }))
            expect(originalSessionID).not.toBe(ctx.session.get('sessionID'))
        }
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, resolve)
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should refresh the session', (done) => {
        let newSessionID
        let requests = 1
        const middleware = (ctx, next) => {
            if (requests === 1) {
                const originalSessionID = ctx.session.get('sessionID')
                ctx.session.set('hello', 'world')
                ctx.session.refresh()
                newSessionID = ctx.session.get('sessionID')
                expect(ctx.session.get('hello')).toBe('world')
                expect(newSessionID).not.toBe(originalSessionID)
            }
            if (requests === 2) {
                expect(ctx.session.get('hello')).toBe('world')
                expect(ctx.session.get('sessionID')).toBe(newSessionID)
            }
            requests++
            next()
        }
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, () => {
                    browser.visit(localhost, resolve)
                })
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should try to prevent session hijacking', (done) => {
        let sessionID
        let requests = 1
        const middleware = (ctx, next) => {
            if (requests === 1) {
                sessionID = ctx.session.get('sessionID')
                ctx.session.set('first', 'request')
                ctx.session.set('sessionIP', 'Fake')
            }
            if (requests === 2) {
                const newSessionID = ctx.session.get('sessionID')
                expect(newSessionID).not.toBe(sessionID)
                expect(ctx.session.get('first')).toBeUndefined()
                ctx.session.set('second', 'request')
                 ctx.session.set('sessionUserAgent', 'Fake')
                sessionID = newSessionID
            }
            if (requests === 3) {
                const newSessionID = ctx.session.get('sessionID')
                expect(newSessionID).not.toBe(sessionID)
                expect(ctx.session.get('second')).toBeUndefined()
            }
            requests++
            next()
        }
        const visits = browser => {
            return new Promise(resolve => {
                browser.visit(localhost, () => {
                    browser.visit(localhost, () => {
                        browser.visit(localhost, resolve)
                    })
                })
            })
        }

        request({ visits, middleware })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
    it('should expire the session', (done) => {
        const expire = (opts) => {
            let requests = 1

            const middleware = (ctx, next) => {
                if (requests === 1) ctx.session.set('hello', 'world')
                if (requests === 2) {
                    expect(ctx.session.get()).not.toEqual(jasmine.objectContaining({
                        hello: 'world'
                    }))
                }
                requests++
                next()
            }
            const visits = browser => {
                return new Promise(resolve => {
                    browser.visit(localhost, () => {
                        const timeout = 10000
                        setTimeout(() => browser.visit(localhost, resolve), timeout)
                    })
                })
            }
            return request({ visits, middleware, opts })
        }

        const maxAge = 9
        const expires = new Date(Date.now() + (maxAge*1000))
        expire({ maxAge })
        .then(() => expire({ expires }))
        .then(done)
        .catch(e => console.error(e.stack || e))
    }, 30000)
    it('should accept an external memory store', (done) => {
        const middleware = (ctx, next) => {
            ctx.session.set('hello', 'world')
            expect(ctx.session.get('hello')).toBe('world')
            ctx.session.destroy('hello')
            expect(ctx.session.get('hello')).toBeUndefined()
        }
        const visits = browser => (
            new Promise(resolve => browser.visit(localhost, resolve))
        )

        const opts = { store: memoryStore }
        request({ visits, middleware, opts })
        .then(done)
        .catch(e => console.error(e.stack || e))
    })
})
