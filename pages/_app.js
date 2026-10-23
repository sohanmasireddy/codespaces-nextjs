
import Head from 'next/head'
import '../global.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>GOD AI</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <meta
          name="theme-color"
          content="#FAF9F6"
        />
      </Head>

      <Component {...pageProps} />
    </>
  )
}
